import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { connectDB } from "@/lib/db";
import { AllowlistEntry, ALLOWLIST_PHASES, AllowlistPhase } from "@/lib/models/AllowlistEntry";

export const dynamic = "force-dynamic";

/**
 * Wallet Checker lookup. The address comes from the wallet the visitor
 * connected in the browser — no session required, since an allowlist spot
 * isn't private data and forcing a SIWE signature just to read your own
 * status is friction the checker doesn't need. Only ever answers about the
 * one address asked for, so the list itself can't be enumerated.
 */
export async function GET(req: NextRequest) {
  const address = new URL(req.url).searchParams.get("address")?.trim() ?? "";
  if (!isAddress(address)) return NextResponse.json({ error: "Connect a wallet to check its eligibility" }, { status: 400 });

  await connectDB();
  const wallet = address.toLowerCase();
  const entries = await AllowlistEntry.find({ address: wallet }).select("phase label").lean();

  const phases = Object.fromEntries(
    ALLOWLIST_PHASES.map((phase) => {
      const entry = entries.find((row: { phase: AllowlistPhase }) => row.phase === phase);
      return [phase, { eligible: !!entry, label: entry?.label || null }];
    })
  );

  // Whether each list has been uploaded at all, so the page can say
  // "not published yet" instead of "you're not eligible" before a drop's
  // lists exist.
  const published = Object.fromEntries(
    await Promise.all(ALLOWLIST_PHASES.map(async (phase) => [phase, !!(await AllowlistEntry.exists({ phase }))] as const))
  );

  return NextResponse.json({
    address: wallet,
    phases,
    published,
    eligible: ALLOWLIST_PHASES.some((phase) => phases[phase].eligible),
  });
}
