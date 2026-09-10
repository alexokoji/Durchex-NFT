import { NextRequest, NextResponse } from "next/server";
import { list, del, type ListBlobResultBlob } from "@vercel/blob";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { User } from "@/lib/models/User";
import { VerificationRequest } from "@/lib/models/VerificationRequest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Finds media in blob storage that nothing in the database points at, and
 * — only when explicitly told to — deletes it.
 *
 * This has to run on the deployed site rather than from a workstation:
 * the blob token is a sensitive Vercel env var and the database is not
 * reachable from outside, so this is the one place that can see both.
 *
 * "Unused" deliberately means *referenced by no row at all*, not "not on
 * an active collection". A hidden collection, an unlisted item and a
 * pending verification request all still own their images, and a creator
 * who unhides a collection to find its artwork gone would have lost it
 * permanently. Blob deletion has no undo, so the safe reading of the
 * question is the only one implemented.
 */

/** Every field in every model that can hold a blob URL. */
const REFERENCE_FIELDS = [
  { model: Collection, fields: ["logoUrl", "bannerUrl"] },
  { model: Item, fields: ["mediaUrl"] },
  { model: User, fields: ["avatarUrl", "bannerUrl"] },
  // Identity documents submitted for purple-tier verification live here.
  // They are ordinary references like any other and must be protected as
  // such — losing one destroys the evidence behind a granted badge.
  { model: VerificationRequest, fields: ["avatarUrl", "bannerUrl", "idDocumentUrl"] },
] as const;

/**
 * Anything uploaded in the last day is left alone regardless.
 *
 * An upload lands in blob storage before the row that references it is
 * written, so a file created seconds ago can be genuinely orphaned and
 * about to be claimed. Skipping the recent window costs nothing — those
 * files are tiny relative to a full store — and removes the only race
 * that could delete something a creator was in the middle of using.
 */
const GRACE_MS = 24 * 60 * 60 * 1000;

async function referencedUrls(): Promise<Set<string>> {
  await connectDB();
  const referenced = new Set<string>();

  for (const { model, fields } of REFERENCE_FIELDS) {
    const projection = Object.fromEntries(fields.map((f) => [f, 1]));
    // .lean() and a projection keep this to the URL strings alone — the
    // media itself is never loaded, only the addresses of it.
    const docs = await (model as typeof Collection).find({}, projection).lean();
    for (const doc of docs) {
      for (const field of fields) {
        const value = (doc as unknown as Record<string, unknown>)[field];
        if (typeof value !== "string" || value === "") continue;
        referenced.add(value);
        // Also index by path, so a URL stored against an older store host
        // still protects the same file today.
        try {
          referenced.add(decodeURIComponent(new URL(value).pathname));
        } catch {
          /* not an absolute URL — the raw value is already recorded */
        }
      }
    }
  }
  return referenced;
}

function isReferenced(blob: ListBlobResultBlob, referenced: Set<string>): boolean {
  if (referenced.has(blob.url)) return true;
  if (referenced.has(blob.downloadUrl)) return true;
  const path = blob.pathname.startsWith("/") ? blob.pathname : `/${blob.pathname}`;
  return referenced.has(path) || referenced.has(blob.pathname);
}

async function allBlobs(): Promise<ListBlobResultBlob[]> {
  const blobs: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  return blobs;
}

async function audit() {
  const [blobs, referenced] = await Promise.all([allBlobs(), referencedUrls()]);
  const cutoff = Date.now() - GRACE_MS;

  const orphans: ListBlobResultBlob[] = [];
  const recent: ListBlobResultBlob[] = [];
  let inUseBytes = 0;

  for (const blob of blobs) {
    if (isReferenced(blob, referenced)) {
      inUseBytes += blob.size;
      continue;
    }
    if (new Date(blob.uploadedAt).getTime() > cutoff) recent.push(blob);
    else orphans.push(blob);
  }

  // Biggest first: the point of this is reclaiming space, and it makes the
  // report answer "what is actually using the store" at a glance.
  orphans.sort((a, b) => b.size - a.size);

  const sum = (list: ListBlobResultBlob[]) => list.reduce((total, b) => total + b.size, 0);
  return { blobs, referenced, orphans, recent, inUseBytes, orphanBytes: sum(orphans), recentBytes: sum(recent) };
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  try {
    const { blobs, referenced, orphans, recent, inUseBytes, orphanBytes, recentBytes } = await audit();
    return NextResponse.json({
      totals: {
        files: blobs.length,
        stored: mb(inUseBytes + orphanBytes + recentBytes),
        inUse: `${blobs.length - orphans.length - recent.length} files, ${mb(inUseBytes)}`,
        unused: `${orphans.length} files, ${mb(orphanBytes)}`,
        heldBackAsRecent: `${recent.length} files, ${mb(recentBytes)}`,
      },
      referencedUrlCount: referenced.size,
      reclaimableBytes: orphanBytes,
      orphans: orphans.map((b) => ({
        pathname: b.pathname,
        size: b.size,
        sizeMb: Number((b.size / 1024 / 1024).toFixed(2)),
        uploadedAt: b.uploadedAt,
        url: b.url,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Blob audit failed" },
      { status: 502 }
    );
  }
}

/**
 * Deletes the unreferenced files. Requires `{ "confirm": "DELETE" }`.
 *
 * The orphan set is recomputed here rather than accepting a list from the
 * caller. A list posted back is a snapshot: between the audit and the
 * delete a creator can have uploaded artwork and saved it against a
 * collection, and honouring the stale list would delete a file that is now
 * in use. Recomputing means the only thing ever deleted is something
 * unreferenced at the moment of deletion.
 */
export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "DELETE") {
    return NextResponse.json(
      { error: 'Refusing to delete without { "confirm": "DELETE" }. Run GET first to see what would go.' },
      { status: 400 }
    );
  }

  try {
    const { orphans, orphanBytes } = await audit();
    if (orphans.length === 0) {
      return NextResponse.json({ deleted: 0, freed: "0 MB", message: "Nothing unreferenced to delete." });
    }

    // Batched: del() takes many URLs at once, and one call per file would
    // not finish inside the function's time budget on a large store.
    let deleted = 0;
    for (let i = 0; i < orphans.length; i += 100) {
      const batch = orphans.slice(i, i + 100);
      await del(batch.map((b) => b.url));
      deleted += batch.length;
    }

    return NextResponse.json({
      deleted,
      freed: mb(orphanBytes),
      freedBytes: orphanBytes,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Blob deletion failed" },
      { status: 502 }
    );
  }
}
