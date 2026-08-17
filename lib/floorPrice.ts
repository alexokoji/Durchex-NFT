import { Types } from "mongoose";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { Listing } from "@/lib/models/Listing";

/**
 * Floor price is derived data, never a creator-set value: the lowest
 * per-unit price among this collection's currently active, valid listings.
 *
 * Two sources feed it:
 *  - Item.priceEth for the primary listing (ERC-721 resale/lazy ask, or an
 *    ERC-1155 edition's still-open primary sale) — a sold/unlisted item's
 *    priceEth is 0 so it's naturally excluded, see lib/web3/chainSync.ts.
 *  - active Listing documents (ERC-1155 resale only — several holders can
 *    each list part of their balance at different prices simultaneously,
 *    which doesn't fit a single field on Item the way 721 resale does).
 *
 * Call this after anything that changes listing state (list/relist/unlist/
 * sale/cancel) so Collection.stats.floorEth always reflects live
 * marketplace data instead of being incrementally patched and going stale.
 */
export async function recalculateCollectionFloor(collectionId: Types.ObjectId | string) {
  const id = typeof collectionId === "string" ? new Types.ObjectId(collectionId) : collectionId;

  const [[lowestItem], [lowestListing]] = await Promise.all([
    Item.aggregate([
      { $match: { collection: id, status: { $in: ["fixed_price", "auction"] }, priceEth: { $gt: 0 } } },
      { $sort: { priceEth: 1 } },
      { $limit: 1 },
      { $project: { _id: 0, priceEth: 1 } },
    ]),
    Listing.aggregate([
      {
        $match: {
          collection: id,
          status: "active",
          pricePerUnitEth: { $gt: 0 },
          $expr: { $lt: ["$filledQuantity", "$quantity"] },
        },
      },
      { $sort: { pricePerUnitEth: 1 } },
      { $limit: 1 },
      { $project: { _id: 0, pricePerUnitEth: 1 } },
    ]),
  ]);

  const candidates = [lowestItem?.priceEth, lowestListing?.pricePerUnitEth].filter(
    (v): v is number => typeof v === "number"
  );
  const floor = candidates.length > 0 ? Math.min(...candidates) : 0;

  await Collection.updateOne({ _id: id }, { $set: { "stats.floorEth": floor } });
}
