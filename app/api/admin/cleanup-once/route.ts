import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { Activity } from "@/lib/models/Activity";

// Temporary, secret-gated one-off route to remove test collections created
// while verifying the floor-price/pricing audit fixes — removed after use.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cleanup-secret");
  if (!secret || secret !== process.env.CLEANUP_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const collections = await Collection.find({ slug: { $regex: "^floor-test-" } }).select("_id slug");
  const collectionIds = collections.map((c) => c._id);
  const items = await Item.find({ collection: { $in: collectionIds } }).select("_id");
  const itemIds = items.map((i) => i._id);

  await Promise.all([
    Activity.deleteMany({ item: { $in: itemIds } }),
    Item.deleteMany({ _id: { $in: itemIds } }),
    Collection.deleteMany({ _id: { $in: collectionIds } }),
  ]);

  return NextResponse.json({ deletedCollections: collections.map((c) => c.slug), deletedItems: itemIds.length });
}
