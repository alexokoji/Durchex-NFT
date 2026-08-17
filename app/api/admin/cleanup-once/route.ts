import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { Activity } from "@/lib/models/Activity";
import { ItemBalance } from "@/lib/models/ItemBalance";
import { Listing } from "@/lib/models/Listing";

// Temporary, secret-gated one-off route to remove test collections created
// while verifying ERC-1155 support — removed after use.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cleanup-secret");
  if (!secret || secret !== process.env.CLEANUP_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const collections = await Collection.find({ slug: { $regex: "^1155-test-" } }).select("_id slug");
  const collectionIds = collections.map((c) => c._id);
  const items = await Item.find({ collection: { $in: collectionIds } }).select("_id");
  const itemIds = items.map((i) => i._id);

  await Promise.all([
    Activity.deleteMany({ item: { $in: itemIds } }),
    ItemBalance.deleteMany({ item: { $in: itemIds } }),
    Listing.deleteMany({ item: { $in: itemIds } }),
    Item.deleteMany({ _id: { $in: itemIds } }),
    Collection.deleteMany({ _id: { $in: collectionIds } }),
  ]);

  return NextResponse.json({ deletedCollections: collections.map((c) => c.slug), deletedItems: itemIds.length });
}
