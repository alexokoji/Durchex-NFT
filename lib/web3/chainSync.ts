/**
 * Shared logic for turning a confirmed on-chain marketplace event into the
 * MongoDB state change it implies. Used by two callers:
 *  - scripts/indexer.ts — a long-running watcher, for deployments that have
 *    one running somewhere.
 *  - lib/web3/verifyPurchase.ts — an on-demand, server-verified path used
 *    when no indexer is running (see that file for how it stays trustworthy
 *    without a continuous watcher).
 * Keeping this in one place means both paths apply state changes identically
 * instead of two hand-maintained copies drifting apart.
 */
import { formatEther } from "viem";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { User } from "@/lib/models/User";
import { recordActivity } from "@/lib/activity";

export async function resolveOrCreateUser(address: string) {
  const lower = address.toLowerCase();
  let user = await User.findOne({ address: lower });
  if (!user) {
    user = await User.create({ address: lower, username: `wallet_${lower.slice(2, 8)}` });
  }
  return user;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// contractAddress is stored checksummed (mixed-case, via viem's getAddress())
// wherever a collection gets wired up, but on-chain event args and RPC
// responses aren't guaranteed to match that casing — compare case-insensitively.
async function findCollectionByContract(nftAddress: string) {
  return Collection.findOne({ contractAddress: new RegExp(`^${escapeRegExp(nftAddress)}$`, "i") });
}

/** A lazy item's first sale: mints it (isMinted/tokenId weren't set until now) and transfers to the buyer. */
export async function handleVoucherRedeemed(
  nft: string,
  tokenId: bigint,
  buyer: string,
  price: bigint,
  txHash: string
) {
  const collection = await findCollectionByContract(nft);
  if (!collection) return { synced: false as const, reason: "unknown collection contract" };

  const item = await Item.findOne({
    collection: collection._id,
    "voucher.tokenId": tokenId.toString(),
    isMinted: false,
  });
  if (!item) return { synced: false as const, reason: "already synced or no matching lazy item" };

  const buyerUser = await resolveOrCreateUser(buyer);
  const priceEth = Number(formatEther(price));

  item.isMinted = true;
  item.tokenId = tokenId.toString();
  item.owner = buyerUser._id;
  item.status = "not_listed";
  item.priceEth = priceEth;
  await item.save();

  await Promise.all([
    Collection.updateOne(
      { _id: collection._id },
      { $inc: { "stats.sales": 1, "stats.volume24hEth": priceEth, "stats.totalVolumeEth": priceEth } }
    ),
    recordActivity({
      type: "sale",
      item: item._id,
      from: item.creator,
      to: buyerUser._id,
      priceEth,
      txHash,
    }),
  ]);

  return { synced: true as const, itemId: String(item._id) };
}

/** A resale of an already-minted item, either fixed-price or a settled auction. */
export async function handleResale(
  nft: string,
  tokenId: bigint,
  seller: string,
  buyer: string,
  price: bigint,
  txHash: string
) {
  const collection = await findCollectionByContract(nft);
  if (!collection) return { synced: false as const, reason: "unknown collection contract" };

  const item = await Item.findOne({ collection: collection._id, tokenId: tokenId.toString() });
  if (!item) return { synced: false as const, reason: "no matching item" };

  const buyerUser = await resolveOrCreateUser(buyer);
  const priceEth = Number(formatEther(price));

  item.owner = buyerUser._id;
  item.status = "not_listed";
  item.priceEth = priceEth;
  item.highestBidEth = 0;
  item.auctionEndsAt = null;
  await item.save();

  await Promise.all([
    Collection.updateOne(
      { _id: collection._id },
      { $inc: { "stats.sales": 1, "stats.volume24hEth": priceEth, "stats.totalVolumeEth": priceEth } }
    ),
    recordActivity({
      type: "sale",
      item: item._id,
      from: (await User.findOne({ address: seller.toLowerCase() }))?._id,
      to: buyerUser._id,
      priceEth,
      txHash,
    }),
  ]);

  return { synced: true as const, itemId: String(item._id) };
}
