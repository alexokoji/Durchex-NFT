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
import { Types } from "mongoose";
import { formatEther } from "viem";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { User } from "@/lib/models/User";
import { ItemBalance } from "@/lib/models/ItemBalance";
import { Listing } from "@/lib/models/Listing";
import { Activity } from "@/lib/models/Activity";
import { recordActivity, type SaleType } from "@/lib/activity";
import { recalculateCollectionFloor } from "@/lib/floorPrice";

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
  txHash: string,
  saleType: SaleType = "BUY_NOW"
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
  // priceEth is the *current listing ask* — the item isn't listed for
  // anything right now, so it goes to 0. What it actually sold for lives in
  // lastSalePriceEth (and the immutable Activity "sale" record below), never
  // conflated with an active listing price.
  item.priceEth = 0;
  item.lastSalePriceEth = priceEth;
  item.lastSaleTxHash = txHash;
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
      saleType,
      txHash,
    }),
    recalculateCollectionFloor(collection._id),
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
  txHash: string,
  saleType: SaleType = "BUY_NOW"
) {
  const item = await Item.findOne({ tokenId: tokenId.toString() });
  if (!item) return { synced: false as const, reason: "no matching item" };
  // A retried/duplicate confirm call for a settlement already applied —
  // without this guard the stats $inc and Activity record below would
  // double-count the same sale (handleVoucherRedeemed is self-guarding via
  // its isMinted:false filter, but resale has no such natural guard).
  if (item.lastSaleTxHash === txHash) {
    return { synced: false as const, reason: "already synced" };
  }

  const collection = await Collection.findById(item.collection);
  if (!collection) return { synced: false as const, reason: "item has no collection" };
  if (collection.contractAddress.toLowerCase() !== nft.toLowerCase()) {
    return { synced: false as const, reason: "item's collection doesn't match this contract" };
  }

  const buyerUser = await resolveOrCreateUser(buyer);
  const priceEth = Number(formatEther(price));

  item.owner = buyerUser._id;
  item.status = "not_listed";
  item.priceEth = 0;
  item.lastSalePriceEth = priceEth;
  item.lastSaleTxHash = txHash;
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
      saleType,
      txHash,
    }),
    recalculateCollectionFloor(collection._id),
  ]);

  return { synced: true as const, itemId: String(item._id) };
}

/**
 * An ERC-1155 lazy primary-sale purchase: mints `quantity` units to buyer.
 * Unlike handleVoucherRedeemed, the same voucher/tokenId is redeemed
 * repeatedly (by different buyers, or the same buyer buying more), so
 * "already synced" can't be inferred from item state the way it can for a
 * single-use 721 voucher — idempotency is keyed on txHash instead.
 */
export async function handleEditionRedeemed(
  nft: string,
  tokenId: bigint,
  buyer: string,
  quantity: bigint,
  totalPrice: bigint,
  txHash: string,
  saleType: SaleType = "BUY_NOW"
) {
  const item = await Item.findOne({ "editionVoucher.tokenId": tokenId.toString(), standard: "ERC1155" });
  if (!item) return { synced: false as const, reason: "no matching edition item" };
  if (await Activity.exists({ item: item._id, txHash })) {
    return { synced: false as const, reason: "already synced" };
  }

  const collection = await Collection.findById(item.collection);
  if (!collection) return { synced: false as const, reason: "item has no collection" };
  if (collection.contractAddress.toLowerCase() !== nft.toLowerCase()) {
    return { synced: false as const, reason: "item's collection doesn't match this contract" };
  }

  const buyerUser = await resolveOrCreateUser(buyer);
  const qty = Number(quantity);
  const totalPriceEth = Number(formatEther(totalPrice));

  item.isMinted = true;
  item.mintedSupply = (item.mintedSupply ?? 0) + qty;
  // Once every edition is minted, the creator's own primary listing has
  // nothing left to sell — resale continues independently via Listing
  // documents, unrelated to this item-level status.
  if (item.mintedSupply >= item.totalSupply) {
    item.status = "not_listed";
  }
  // A mint is a sale, and the only one most editions ever have while the
  // drop is running — leaving it out is what made "last sale" show an em
  // dash on a token that had traded hundreds of times.
  item.lastSalePriceEth = qty > 0 ? totalPriceEth / qty : totalPriceEth;
  await item.save();

  await Promise.all([
    ItemBalance.findOneAndUpdate(
      { item: item._id, owner: buyerUser._id },
      { $inc: { quantity: qty } },
      { upsert: true }
    ),
    Collection.updateOne(
      { _id: collection._id },
      { $inc: { "stats.sales": 1, "stats.volume24hEth": totalPriceEth, "stats.totalVolumeEth": totalPriceEth } }
    ),
    recordActivity({
      type: "sale",
      item: item._id,
      from: item.creator,
      to: buyerUser._id,
      priceEth: totalPriceEth,
      quantity: qty,
      saleType,
      txHash,
    }),
    recalculateCollectionFloor(collection._id),
  ]);

  return { synced: true as const, itemId: String(item._id) };
}

/**
 * An ERC-1155 resale: transfers `quantity` units from seller to buyer's
 * ItemBalance and marks that much of the Listing as filled. Same
 * txHash-keyed idempotency as handleEditionRedeemed, for the same reason —
 * one Listing can be filled by many separate transactions.
 */
export async function handleListing1155Filled(
  nft: string,
  tokenId: bigint,
  seller: string,
  buyer: string,
  quantity: bigint,
  totalPrice: bigint,
  txHash: string,
  saleType: SaleType = "BUY_NOW"
) {
  const item = await Item.findOne({ tokenId: tokenId.toString(), standard: "ERC1155" });
  if (!item) return { synced: false as const, reason: "no matching item" };
  if (await Activity.exists({ item: item._id, txHash })) {
    return { synced: false as const, reason: "already synced" };
  }

  const collection = await Collection.findById(item.collection);
  if (!collection) return { synced: false as const, reason: "item has no collection" };
  if (collection.contractAddress.toLowerCase() !== nft.toLowerCase()) {
    return { synced: false as const, reason: "item's collection doesn't match this contract" };
  }

  const sellerUser = await resolveOrCreateUser(seller);
  const buyerUser = await resolveOrCreateUser(buyer);
  const qty = Number(quantity);
  const totalPriceEth = Number(formatEther(totalPrice));

  // Last sale is a per-unit figure, so it compares with a listing price
  // and with the 721 paths that already set it. Editions were the only
  // sale path that never wrote it, which is why the stat sat empty on
  // every 1155 no matter how much it traded.
  item.lastSalePriceEth = qty > 0 ? totalPriceEth / qty : totalPriceEth;
  await item.save();

  await Promise.all([
    ItemBalance.findOneAndUpdate({ item: item._id, owner: sellerUser._id }, { $inc: { quantity: -qty } }),
    ItemBalance.findOneAndUpdate(
      { item: item._id, owner: buyerUser._id },
      { $inc: { quantity: qty } },
      { upsert: true }
    ),
    markListingFilled({
      sellerId: sellerUser._id,
      itemId: item._id,
      nft,
      qty,
      pricePerUnitEth: qty > 0 ? totalPriceEth / qty : totalPriceEth,
    }),
    Collection.updateOne(
      { _id: collection._id },
      { $inc: { "stats.sales": 1, "stats.volume24hEth": totalPriceEth, "stats.totalVolumeEth": totalPriceEth } }
    ),
    recordActivity({
      type: "sale",
      item: item._id,
      from: sellerUser._id,
      to: buyerUser._id,
      priceEth: totalPriceEth,
      quantity: qty,
      saleType,
      txHash,
    }),
    recalculateCollectionFloor(collection._id),
  ]);

  return { synced: true as const, itemId: String(item._id) };
}

/**
 * Credits units against the seller's live listing and retires it once
 * nothing is left.
 *
 * The count was being incremented without ever changing status, so a
 * listing whose units had all sold stayed "active" forever: it kept
 * appearing on the item page reading "0 of 1 left", still counted as a
 * live listing, and offered a buy box whose only permitted quantity was
 * zero. A listing with nothing left is finished, and should say so.
 */
export async function markListingFilled({
  sellerId,
  itemId,
  nft,
  qty,
  pricePerUnitEth,
}: {
  sellerId: Types.ObjectId;
  itemId: Types.ObjectId;
  nft: string;
  qty: number;
  /** Unit price the buyer actually paid, from the event. */
  pricePerUnitEth?: number;
}) {
  // Matching on seller and item alone picks an arbitrary listing when a
  // seller has several on the same token — and the nft filter was strict
  // about an address whose casing varies between what the client signed
  // and what the event reports, which is how a fill ended up crediting
  // nothing at all. The price the buyer paid identifies which listing was
  // bought; anything else is a guess.
  const live = await Listing.find({
    seller: sellerId,
    item: itemId,
    status: { $in: ["active", "auction"] },
  }).sort({ pricePerUnitEth: 1 });

  const withRoom = live.filter((l) => (l.filledQuantity ?? 0) < l.quantity);
  // Oldest first among equal prices, so a relisting at the same price
  // doesn't absorb a fill that belongs to the listing already standing.
  const byPrice =
    pricePerUnitEth !== undefined
      ? withRoom
          .filter((l) => Math.abs(l.pricePerUnitEth - pricePerUnitEth) < 1e-9)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      : [];
  // No price match: the cheapest live one is what a floor purchase took.
  const listing = byPrice[0] ?? withRoom[0];
  if (!listing) return;

  listing.filledQuantity = (listing.filledQuantity ?? 0) + qty;
  if (listing.filledQuantity >= listing.quantity) listing.status = "filled";
  await listing.save();
}
