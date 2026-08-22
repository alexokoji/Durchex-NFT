import { marketplaceAddressFor } from "@/lib/web3/marketplaceAbi";
import { DEFAULT_NFT_CHAIN_ID } from "@/lib/web3/deployedContract";

/**
 * What counts as a listing that can actually be filled right now.
 *
 * A floor is the cheapest thing a buyer can genuinely buy. That is not the
 * same as the cheapest number stored against an item: a voucher whose
 * deadline has passed, a signature that was never captured, an edition
 * with nothing left to mint, a resale listing already fully sold — each
 * has a price in the database and none of them can be bought.
 *
 * These rules lived only inside GET /api/collections/[id]/floor, so the
 * careful endpoint and the stored Collection.stats.floorEth — the number
 * every page actually renders — could disagree, with the stored one held
 * down by listings nobody could fill. One definition, used everywhere.
 */
export type FloorItemLike = {
  standard?: string;
  status?: string;
  isMinted?: boolean;
  priceEth?: number;
  totalSupply?: number | null;
  mintedSupply?: number | null;
  voucher?: { signature?: string | null; deadline?: string | null } | null;
  editionVoucher?: { signature?: string | null; deadline?: string | null } | null;
  listing?: { signature?: string | null; deadline?: string | null; marketplace?: string | null } | null;
  chainId?: number;
};

export type FloorListingLike = {
  pricePerUnitEth?: number;
  quantity?: number;
  filledQuantity?: number;
  signature?: string | null;
  deadline?: Date | string | null;
  status?: string;
  marketplace?: string | null;
  chainId?: number;
};

/**
 * Whether a listing's signature still authorizes the marketplace in use.
 *
 * EIP-712 binds a signature to one verifyingContract, so after a
 * marketplace redeploy every listing signed against the old one recovers
 * to the wrong signer and reverts. Those listings are not merely stale,
 * they are unfillable, and counting one as the floor advertises a price no
 * buyer can get — the exact failure this file exists to prevent.
 *
 * A null marketplace means the listing predates the field, which in
 * practice means it was signed against the superseded contract.
 */
export function signedForCurrentMarketplace(
  marketplace: string | null | undefined,
  chainId?: number
): boolean {
  // Items carry no chain of their own — their collection does — so an
  // absent one means the default chain rather than "unknown". Resolving it
  // to undefined here would silently disable the whole check.
  const current = marketplaceAddressFor(chainId ?? DEFAULT_NFT_CHAIN_ID);
  if (!current) return true; // no marketplace configured; nothing to compare against
  return !!marketplace && marketplace.toLowerCase() === current.toLowerCase();
}

/** Deadlines are unix seconds as strings; 0 means "no expiry". */
function unexpired(deadline?: string | null): boolean {
  if (deadline === undefined || deadline === null) return false;
  const n = Number(deadline);
  if (!Number.isFinite(n)) return false;
  return n === 0 || n > Math.floor(Date.now() / 1000);
}

/**
 * The per-unit ask this item currently offers on the SECONDARY market, or
 * null if it offers none.
 *
 * Primary sales — an ERC-1155 edition still minting, an unredeemed lazy
 * ERC-721 voucher — are deliberately excluded. Floor means the cheapest
 * *listing*, and folding the mint price in made it useless during a mint:
 * a collection minting at 0.000001 reported that as its floor no matter
 * what holders were asking, and "Buy Floor" offered a mint rather than
 * somebody's listing. Minting is its own path with its own panel; this is
 * about the resale market.
 */
export function fillableItemAsk(item: FloorItemLike): number | null {
  const price = item.priceEth ?? 0;
  if (price <= 0 || item.status !== "fixed_price") return null;

  // An ERC-1155's own priceEth is its primary edition price; resale of an
  // edition lives in Listing documents instead (several holders can each
  // be asking a different amount), so there is nothing to take from here.
  if (item.standard === "ERC1155") return null;

  // An unminted ERC-721 is still the creator's primary sale.
  if (!item.isMinted) return null;

  const l = item.listing;
  if (!l?.signature || !unexpired(l.deadline)) return null;
  if (!signedForCurrentMarketplace(l.marketplace, item.chainId)) return null;
  return price;
}

/** Whether an ERC-1155 resale listing still has units anyone can buy. */
export function fillableListingAsk(listing: FloorListingLike): number | null {
  const price = listing.pricePerUnitEth ?? 0;
  if (price <= 0 || listing.status !== "active" || !listing.signature) return null;
  if ((listing.filledQuantity ?? 0) >= (listing.quantity ?? 0)) return null;
  if (listing.deadline && new Date(listing.deadline) <= new Date()) return null;
  if (!signedForCurrentMarketplace(listing.marketplace, listing.chainId)) return null;
  return price;
}
