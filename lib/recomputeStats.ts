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
import { offersEscrowAddressFor } from "@/lib/web3/offersEscrow";
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
    // The old single-value baseline was captured under a different
    // definition of "floor" — it counted the primary mint — so comparing
    // today's listing floor against it produced a five-figure percentage.
    // Clearing it lets the series be the only source.
    await Collection.updateOne(
      { _id: collection._id },
      { $set: { "stats.floorEth24hAgo": 0 } }
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

  // Roughly three days. Fifty thousand blocks meant ~56 chunked log calls
  // plus a block read per fill, which the free RPC tier refuses outright —
  // and a listing older than this has long since been reconciled.
  const head = await client.getBlockNumber();
  const from = head > BigInt(20_000) ? head - BigInt(20_000) : BigInt(0);
  const deadline = Date.now() + 20_000;
  const logs = [];
  for (let cursor = from; cursor <= head; cursor += BigInt(901)) {
    const to = cursor + BigInt(900) > head ? head : cursor + BigInt(900);
    logs.push(
      ...(await client.getLogs({ address: marketplace, event: LISTING_FILLED, fromBlock: cursor, toBlock: to }))
    );
    // Better to repair part of the window now than to fail the whole pass
    // and repair none of it.
    if (Date.now() > deadline) break;
  }

  // Each fill is kept as its own dated event rather than summed per
  // seller-and-price. Summing was actively destructive: a seller who sold
  // at a price and later listed again at the same price had the old fill
  // applied to the new listing, so a listing created seconds earlier came
  // back marked sold. Running every five minutes, that quietly killed
  // relistings.
  const fills: { seller: string; pricePerUnit: number; qty: number; at: number }[] = [];
  const blockTimes = new Map<string, number>();
  for (const log of logs) {
    const a = log.args as { seller?: string; quantity?: bigint; totalPrice?: bigint };
    if (!a.seller || !a.quantity) continue;
    const key = String(log.blockNumber);
    if (!blockTimes.has(key)) {
      const block = await client.getBlock({ blockNumber: log.blockNumber });
      blockTimes.set(key, Number(block.timestamp) * 1000);
    }
    const qty = Number(a.quantity);
    fills.push({
      seller: a.seller.toLowerCase(),
      pricePerUnit: Number(formatEther(a.totalPrice ?? BigInt(0))) / (qty || 1),
      qty,
      at: blockTimes.get(key) ?? 0,
    });
  }

  let repaired = 0;
  let unmatched = 0;
  // Oldest listings first, so an older listing claims an older fill.
  const listings = await Listing.find({ status: { $in: ["active", "auction", "filled"] } })
    .sort({ createdAt: 1 })
    .populate("seller", "address")
    .lean();

  const consumed = new Set<number>();
  for (const listing of listings) {
    const address = (listing.seller as { address?: string } | null)?.address;
    if (!address) continue;
    const createdAt = new Date(listing.createdAt as Date).getTime();

    let credited = 0;
    fills.forEach((fill, index) => {
      if (consumed.has(index)) return;
      if (credited >= listing.quantity) return;
      if (fill.seller !== address.toLowerCase()) return;
      if (Math.abs(fill.pricePerUnit - listing.pricePerUnitEth) > 1e-9) return;
      // A fill that happened before the listing existed cannot be a fill
      // *of* it. This is the check whose absence caused the damage.
      if (fill.at < createdAt) return;
      credited += fill.qty;
      consumed.add(index);
    });
    credited = Math.min(credited, listing.quantity);

    if (credited === (listing.filledQuantity ?? 0)) continue;
    await Listing.updateOne(
      { _id: listing._id },
      {
        filledQuantity: credited,
        status: credited >= listing.quantity ? "filled" : "active",
      }
    );
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
export async function closeSpentEscrowOffers(chainId: number) {
  const client = rpcClient(chainId);
  const escrow = offersEscrowAddressFor(chainId);
  if (!client || !escrow) return { closed: 0 };

  // The contract's escrow balance is the only honest answer to "is this
  // offer still live". A fill or a withdrawal empties it, and either way
  // there is nothing left for a holder to accept.
  const open = await Bid.find({ type: "offer", status: "active", escrowOfferId: { $ne: null } })
    .select("_id escrowOfferId")
    .lean();

  let closed = 0;
  for (const bid of open) {
    const remaining = (await client.readContract({
      address: escrow,
      abi: [
        {
          type: "function",
          name: "escrowOf",
          stateMutability: "view",
          inputs: [{ name: "offerId", type: "uint256" }],
          outputs: [{ type: "uint256" }],
        },
      ] as const,
      functionName: "escrowOf",
      args: [BigInt(String(bid.escrowOfferId))],
    })) as bigint;
    if (remaining > BigInt(0)) continue;
    await Bid.updateOne({ _id: bid._id }, { status: "accepted" });
    closed += 1;
  }
  return { closed };
}

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
