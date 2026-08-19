import { Types } from "mongoose";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { Listing } from "@/lib/models/Listing";
import { fillableItemAsk, fillableListingAsk } from "@/lib/floorValidity";

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

  // Validity can't be expressed as a query — an expired deadline, a
  // missing signature and a sold-out edition are all "price > 0" in the
  // database — so candidates are filtered in code against the single
  // shared rule in lib/floorValidity.ts.
  const [items, listings] = await Promise.all([
    Item.find({ collection: id, status: "fixed_price", priceEth: { $gt: 0 } })
      .select("standard status isMinted priceEth totalSupply mintedSupply voucher editionVoucher listing")
      .lean(),
    Listing.find({ collection: id, status: "active", pricePerUnitEth: { $gt: 0 } })
      .select("pricePerUnitEth quantity filledQuantity signature deadline status")
      .lean(),
  ]);

  const candidates = [
    ...items.map((i) => fillableItemAsk(i as never)),
    ...listings.map((l) => fillableListingAsk(l as never)),
  ].filter((v): v is number => typeof v === "number");

  const floor = candidates.length > 0 ? Math.min(...candidates) : 0;

  // Roll the daily snapshot forward whenever the stored one has aged past
  // 24h, so the header's "1D floor %" compares against a real yesterday
  // rather than an arbitrary earlier reading. The value being replaced is
  // the floor as it stood at the last roll — i.e. a day ago.
  const existing = await Collection.findById(id).select("stats.floorEth stats.floorSnapshotAt").lean();
  const snapshotAt: Date | null = existing?.stats?.floorSnapshotAt ?? null;
  const stale = !snapshotAt || Date.now() - new Date(snapshotAt).getTime() >= 24 * 60 * 60 * 1000;
  const update: Record<string, unknown> = { "stats.floorEth": floor };
  if (stale) {
    update["stats.floorEth24hAgo"] = existing?.stats?.floorEth ?? floor;
    update["stats.floorSnapshotAt"] = new Date();
  }

  await Collection.updateOne({ _id: id }, { $set: update });
}
