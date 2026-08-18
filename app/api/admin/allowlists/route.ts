import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { connectDB } from "@/lib/db";
import { AllowlistEntry, ALLOWLIST_PHASES, AllowlistPhase } from "@/lib/models/AllowlistEntry";
import { parseAllowlistCsv } from "@/lib/allowlistCsv";

const MAX_CSV_BYTES = 8_000_000;
const PREVIEW_LIMIT = 50;

function readPhase(value: string | null): AllowlistPhase | null {
  return ALLOWLIST_PHASES.includes(value as AllowlistPhase) ? (value as AllowlistPhase) : null;
}

/** Per-phase counts plus a small preview (optionally filtered by ?q=). */
async function summarize(q?: string) {
  const filter = q ? { address: { $regex: q.toLowerCase().replace(/[^a-z0-9x]/g, ""), $options: "i" } } : {};
  const phases = await Promise.all(
    ALLOWLIST_PHASES.map(async (phase) => {
      const [total, matched, entries, newest] = await Promise.all([
        AllowlistEntry.countDocuments({ phase }),
        q ? AllowlistEntry.countDocuments({ phase, ...filter }) : Promise.resolve(null),
        AllowlistEntry.find({ phase, ...filter }).sort({ updatedAt: -1 }).limit(PREVIEW_LIMIT).select("address label updatedAt").lean(),
        AllowlistEntry.findOne({ phase }).sort({ updatedAt: -1 }).select("updatedAt").lean(),
      ]);
      return [phase, { total, matched, entries, updatedAt: newest?.updatedAt ?? null }] as const;
    })
  );
  return Object.fromEntries(phases);
}

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  const q = new URL(req.url).searchParams.get("q")?.trim() || undefined;
  await connectDB();
  return NextResponse.json({ lists: await summarize(q) });
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const phase = readPhase(body.phase);
  if (!phase) return NextResponse.json({ error: "phase must be gtd or fcfs" }, { status: 400 });

  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) return NextResponse.json({ error: "The CSV file is empty" }, { status: 400 });
  if (csv.length > MAX_CSV_BYTES) return NextResponse.json({ error: "That CSV is too large — split it into smaller files" }, { status: 413 });

  // "replace" swaps the whole list for the new file, "append" merges into
  // what's already there. Replace is the default because a re-uploaded
  // list is usually the corrected version of the same list.
  const mode = body.mode === "append" ? "append" : "replace";
  const { rows, skipped, skippedCount, duplicatesInFile } = parseAllowlistCsv(csv);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No wallet addresses found in that file", skipped }, { status: 400 });
  }

  await connectDB();
  if (mode === "replace") await AllowlistEntry.deleteMany({ phase });

  const now = new Date();
  const result = await AllowlistEntry.bulkWrite(
    rows.map((row) => ({
      updateOne: {
        filter: { phase, address: row.address },
        update: { $set: { label: row.label, updatedAt: now }, $setOnInsert: { phase, address: row.address, createdAt: now } },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  const total = await AllowlistEntry.countDocuments({ phase });
  return NextResponse.json({
    phase,
    mode,
    parsed: rows.length,
    added: result.upsertedCount ?? 0,
    updated: result.modifiedCount ?? 0,
    duplicatesInFile,
    skippedCount,
    skipped,
    total,
    lists: await summarize(),
  });
}

export async function DELETE(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  const phase = readPhase(new URL(req.url).searchParams.get("phase"));
  if (!phase) return NextResponse.json({ error: "phase must be gtd or fcfs" }, { status: 400 });

  await connectDB();
  const { deletedCount } = await AllowlistEntry.deleteMany({ phase });
  return NextResponse.json({ phase, deletedCount, lists: await summarize() });
}
