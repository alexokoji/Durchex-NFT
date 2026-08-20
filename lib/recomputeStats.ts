import { Types } from "mongoose";
import { Activity } from "@/lib/models/Activity";
import { Bid } from "@/lib/models/Bid";
import { Collection } from "@/lib/models/Collection";
import { CollectionOffer } from "@/lib/models/CollectionOffer";
import { Item } from "@/lib/models/Item";
import { recalculateCollectionFloor } from "@/lib/floorPrice";
import { collectionMintProgress } from "@/lib/collectionSupply";
import { Listing } from "@/lib/models/Listing";
import { rpcClient } from "@/lib/web3/reconcile";
import { marketplaceAddressFor } from "@/lib/web3/marketplaceAbi";
import { formatEther, parseAbiItem } from "viem";

const LISTING_FILLED = parseAbiItem(
  "event Listing1155Filled(address indexed nft, uint256 indexed tokenId, address seller, address buyer, uint256 quantity, uint256 totalPrice)"
);

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
 * Rebuilds listing fill counts from the chain.
 *
 * A purchase can settle on-chain and still leave the listing showing every
 * unit available — the sale is recorded but the fill is credited to the
 * wrong listing, or to none. Rather than trusting the running count, this
 * derives each listing's filled quantity from the Listing1155Filled events
 * that actually happened, matched by seller and the unit price paid.
 */
export async function repairListingFills(chainId: number) {
  const client = rpcClient(chainId);
  const marketplace = marketplaceAddressFor(chainId);
  if (!client || !marketplace) return { repaired: 0, unmatched: 0 };

  const head = await client.getBlockNumber();
  const from = head > BigInt(50_000) ? head - BigInt(50_000) : BigInt(0);
  const logs = [];
  for (let cursor = from; cursor <= head; cursor += BigInt(901)) {
    const to = cursor + BigInt(900) > head ? head : cursor + BigInt(900);
    logs.push(
      ...(await client.getLogs({ address: marketplace, event: LISTING_FILLED, fromBlock: cursor, toBlock: to }))
    );
  }

  // Filled counts are rebuilt from zero rather than incremented, so a fill
  // that was credited twice is corrected rather than compounded.
  const tally = new Map<string, number>();
  for (const log of logs) {
    const a = log.args as { seller?: string; quantity?: bigint; totalPrice?: bigint };
    if (!a.seller || !a.quantity) continue;
    const qty = Number(a.quantity);
    const perUnit = Number(formatEther(a.totalPrice ?? BigInt(0))) / (qty || 1);
    tally.set(`${a.seller.toLowerCase()}:${perUnit.toFixed(9)}`, (tally.get(`${a.seller.toLowerCase()}:${perUnit.toFixed(9)}`) ?? 0) + qty);
  }

  let repaired = 0;
  let unmatched = 0;
  const listings = await Listing.find({ status: { $in: ["active", "auction", "filled"] } })
    .populate("seller", "address")
    .lean();
  for (const listing of listings) {
    const address = (listing.seller as { address?: string } | null)?.address;
    if (!address) continue;
    const key = `${address.toLowerCase()}:${listing.pricePerUnitEth.toFixed(9)}`;
    const filledOnChain = tally.get(key);
    if (filledOnChain === undefined) continue;
    const credited = Math.min(filledOnChain, listing.quantity);
    if (credited === (listing.filledQuantity ?? 0)) continue;
    await Listing.updateOne(
      { _id: listing._id },
      {
        filledQuantity: credited,
        ...(credited >= listing.quantity ? { status: "filled" } : {}),
      }
    );
    // Each unit is spent once across listings sharing a seller and price.
    tally.set(key, filledOnChain - credited);
    repaired += 1;
  }
  void unmatched;

  return { repaired, unmatched };
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
