import { Types } from "mongoose";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";

/**
 * Floor price is derived data, never a creator-set value: the lowest
 * priceEth among this collection's currently active, valid listings
 * (fixed-price or auction reserve, minted or lazy — a sold/unlisted item's
 * priceEth is 0 so it's naturally excluded, see lib/web3/chainSync.ts).
 * Call this after anything that changes listing state (list/relist/unlist/
 * sale) so Collection.stats.floorEth always reflects live marketplace data
 * instead of being incrementally patched and going stale.
 */
export async function recalculateCollectionFloor(collectionId: Types.ObjectId | string) {
  const id = typeof collectionId === "string" ? new Types.ObjectId(collectionId) : collectionId;
  const [lowest] = await Item.aggregate([
    { $match: { collection: id, status: { $in: ["fixed_price", "auction"] }, priceEth: { $gt: 0 } } },
    { $sort: { priceEth: 1 } },
    { $limit: 1 },
    { $project: { _id: 0, priceEth: 1 } },
  ]);
  await Collection.updateOne({ _id: id }, { $set: { "stats.floorEth": lowest?.priceEth ?? 0 } });
}
