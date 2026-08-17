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

/**
 * A lazy item's first sale: mints it (isMinted/tokenId weren't set until
 * now) and transfers to the buyer. tokenId is looked up first because it's
 * the one thing guaranteed unique across the whole shared DurchexNFT
 * contract — multiple Collection documents can share the same
 * contractAddress (see lib/web3/deployedContract.ts), so resolving "the"
 * collection from the contract address alone would be ambiguous.
 */
export async function handleVoucherRedeemed(
  nft: string,
  tokenId: bigint,
  buyer: string,
  price: bigint,
  txHash: string
) {
  const item = await Item.findOne({ "voucher.tokenId": tokenId.toString(), isMinted: false });
  if (!item) return { synced: false as const, reason: "already synced or no matching lazy item" };

  const collection = await Collection.findById(item.collection);
  if (!collection) return { synced: false as const, reason: "item has no collection" };
  if (collection.contractAddress.toLowerCase() !== nft.toLowerCase()) {
    return { synced: false as const, reason: "item's collection doesn't match this contract" };
  }

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
  const item = await Item.findOne({ tokenId: tokenId.toString() });
  if (!item) return { synced: false as const, reason: "no matching item" };

  const collection = await Collection.findById(item.collection);
  if (!collection) return { synced: false as const, reason: "item has no collection" };
  if (collection.contractAddress.toLowerCase() !== nft.toLowerCase()) {
    return { synced: false as const, reason: "item's collection doesn't match this contract" };
  }

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
