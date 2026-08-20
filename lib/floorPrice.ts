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
  const existing = await Collection.findById(id)
    .select("stats.floorEth stats.floorHistory")
    .lean();

  // Keep a series rather than one rolled baseline. The old approach stored
  // "the floor when the roll last fired" and called it yesterday's floor,
  // which is only true if the roll fires exactly daily — and it carried a
  // value across the change in what counts as a floor at all.
  const now = new Date();
  const history: { at: Date; floorEth: number }[] = (existing?.stats?.floorHistory ?? []).map(
    (h: { at: Date; floorEth: number }) => ({ at: new Date(h.at), floorEth: h.floorEth })
  );
  const newest = history[history.length - 1];
  const HOUR = 60 * 60 * 1000;
  if (!newest || now.getTime() - newest.at.getTime() >= HOUR) {
    history.push({ at: now, floorEth: floor });
  }
  // Two days of hourly points is all a 1D comparison can use.
  const trimmed = history.slice(-48);

  await Collection.updateOne(
    { _id: id },
    { $set: { "stats.floorEth": floor, "stats.floorHistory": trimmed, "stats.floorSnapshotAt": now } }
  );
}
