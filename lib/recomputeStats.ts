import { Types } from "mongoose";
import { Activity } from "@/lib/models/Activity";
import { Bid } from "@/lib/models/Bid";
import { Collection } from "@/lib/models/Collection";
import { CollectionOffer } from "@/lib/models/CollectionOffer";
import { Item } from "@/lib/models/Item";
import { recalculateCollectionFloor } from "@/lib/floorPrice";
import { collectionMintProgress } from "@/lib/collectionSupply";

/**
 * Rebuilds derived figures from the records that actually happened.
 *
 * Volume, sale counts and last-sale prices were maintained by incrementing
 * them at the moment of a sale — which is only ever as reliable as the
 * write that did the incrementing. Every sale that was recovered by a
 * reconciler, and every one whose write-back failed, left these numbers
 * short. Recomputing from Activity makes them a function of the sales
 * rather than a running tally that can drift.
 *
 * Floor is recalculated through the same path listings use, so it agrees
 * with what the collection page and Buy Floor resolve.
 */
export type StatsRecomputeResult = {
  collections: number;
  itemsWithLastSale: number;
  details: {
    slug: string;
    totalVolumeEth: number;
    sales: number;
    floorEth: number;
  }[];
};

export async function recomputeStats(): Promise<StatsRecomputeResult> {
  const collections = await Collection.find().select("_id slug stats").lean();
  const details: StatsRecomputeResult["details"] = [];

  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  for (const collection of collections) {
    const itemIds = (await Item.find({ collection: collection._id }).select("_id").lean()).map(
      (i) => i._id as Types.ObjectId
    );

    // An ERC-1155 sale row carries a lot total in priceEth and the unit
    // count separately, so volume has to weight by quantity or a bulk
    // purchase counts once.
    const volumeOf = async (from?: Date) => {
      const [row] = await Activity.aggregate([
        {
          $match: {
            item: { $in: itemIds },
            type: "sale",
            priceEth: { $gt: 0 },
            ...(from ? { createdAt: { $gte: from } } : {}),
          },
        },
        {
          $group: {
            _id: null,
            volume: { $sum: { $multiply: ["$priceEth", { $ifNull: ["$quantity", 1] }] } },
            sales: { $sum: 1 },
          },
        },
      ]);
      return { volume: row?.volume ?? 0, sales: row?.sales ?? 0 };
    };

    const [all, day, week, progress] = await Promise.all([
      volumeOf(),
      volumeOf(since24h),
      volumeOf(since7d),
      collectionMintProgress(collection._id),
    ]);

    await Collection.updateOne(
      { _id: collection._id },
      {
        "stats.totalVolumeEth": all.volume,
        "stats.volume24hEth": day.volume,
        "stats.volume7dEth": week.volume,
        "stats.sales": all.sales,
        "stats.items": itemIds.length,
      }
    );
    await recalculateCollectionFloor(collection._id);

    const fresh = await Collection.findById(collection._id).select("stats.floorEth").lean();
    details.push({
      slug: collection.slug,
      totalVolumeEth: all.volume,
      sales: all.sales,
      floorEth: fresh?.stats?.floorEth ?? 0,
    });
    void progress;
  }

  // Last sale per item, from the newest sale we hold. Per unit, so it is
  // comparable with a listing price rather than being a lot total.
  const latest = await Activity.aggregate([
    { $match: { type: "sale", priceEth: { $gt: 0 } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$item",
        priceEth: { $first: "$priceEth" },
        quantity: { $first: "$quantity" },
      },
    },
  ]);
  let itemsWithLastSale = 0;
  for (const row of latest) {
    const qty = Number(row.quantity ?? 1) || 1;
    await Item.updateOne({ _id: row._id }, { lastSalePriceEth: row.priceEth / qty });
    itemsWithLastSale += 1;
  }

  return { collections: collections.length, itemsWithLastSale, details };
}

/**
 * Retires offers that can no longer be filled.
 *
 * Offers made before ETH escrow were WETH promises against a contract the
 * app no longer settles through, so they are unacceptable by construction
 * — but they still counted as the top offer, which is worse than showing
 * none: it advertises a price nobody can actually get.
 *
 * Expired rather than deleted, so the record of what was offered survives.
 */
export async function expireLegacyOffers() {
  const [bids, collectionOffers] = await Promise.all([
    Bid.updateMany(
      { type: "offer", status: "active", escrowOfferId: null },
      { status: "expired" }
    ),
    CollectionOffer.updateMany({ status: "active", escrowOfferId: null }, { status: "expired" }),
  ]);
  return {
    itemOffers: bids.modifiedCount,
    collectionOffers: collectionOffers.modifiedCount,
  };
}
