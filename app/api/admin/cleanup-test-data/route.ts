import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { Activity } from "@/lib/models/Activity";
import { PhaseClaim } from "@/lib/models/PhaseClaim";

// One-time cleanup for throwaway collections created by this session's
// scripted verification tests (slug prefixes match the test names used).
// Deliberately does NOT touch "durx-verse" or anything else. Temporary
// route, secret-gated — delete after use, same pattern as the earlier
// one-off seed trigger.
const TEST_SLUG_PATTERN =
  /^(concurrent-phase-test|e2e-full-test|live-buy-now-demo|phase-gate-test|pipeline-test|repro|resale-test)-/;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cleanup-secret");
  if (!secret || secret !== process.env.CLEANUP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const targets = await Collection.find({ slug: { $regex: TEST_SLUG_PATTERN } }).select("slug").lean();
  const ids = targets.map((c) => c._id);

  // Activity references items, not collections directly — resolve the
  // item ids first so cleanup only touches activity for THESE items.
  const itemDocs = await Item.find({ collection: { $in: ids } }).select("_id").lean();
  const itemIds = itemDocs.map((i) => i._id);

  const [items, activity, claims, collections] = await Promise.all([
    Item.deleteMany({ collection: { $in: ids } }),
    Activity.deleteMany({ item: { $in: itemIds } }),
    PhaseClaim.deleteMany({ collection: { $in: ids } }),
    Collection.deleteMany({ _id: { $in: ids } }),
  ]);

  return NextResponse.json({
    deletedCollections: collections.deletedCount,
    deletedItems: items.deletedCount,
    deletedActivity: activity.deletedCount,
    deletedClaims: claims.deletedCount,
    slugs: targets.map((c) => c.slug),
  });
}
