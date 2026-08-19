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
  listing?: { signature?: string | null; deadline?: string | null } | null;
};

export type FloorListingLike = {
  pricePerUnitEth?: number;
  quantity?: number;
  filledQuantity?: number;
  signature?: string | null;
  deadline?: Date | string | null;
  status?: string;
};

/** Deadlines are unix seconds as strings; 0 means "no expiry". */
function unexpired(deadline?: string | null): boolean {
  if (deadline === undefined || deadline === null) return false;
  const n = Number(deadline);
  if (!Number.isFinite(n)) return false;
  return n === 0 || n > Math.floor(Date.now() / 1000);
}

/**
 * The per-unit ask this item currently offers, or null if it offers none.
 *
 * Mirrors the four shapes the floor endpoint distinguishes: an ERC-1155
 * primary sale, a lazy ERC-721 voucher, an ERC-721 resale listing, and
 * (handled separately, since they are their own documents) ERC-1155
 * resale listings.
 */
export function fillableItemAsk(item: FloorItemLike): number | null {
  const price = item.priceEth ?? 0;
  if (price <= 0 || item.status !== "fixed_price") return null;

  if (item.standard === "ERC1155") {
    const remaining = (item.totalSupply ?? 0) - (item.mintedSupply ?? 0);
    const ev = item.editionVoucher;
    return ev?.signature && remaining > 0 && unexpired(ev.deadline) ? price : null;
  }

  if (!item.isMinted) {
    // A voucher with no deadline predates the redeployed contract and can
    // never be redeemed against it, so it is not a real listing.
    const v = item.voucher;
    return v?.signature && unexpired(v.deadline) ? price : null;
  }

  const l = item.listing;
  return l?.signature && unexpired(l.deadline) ? price : null;
}

/** Whether an ERC-1155 resale listing still has units anyone can buy. */
export function fillableListingAsk(listing: FloorListingLike): number | null {
  const price = listing.pricePerUnitEth ?? 0;
  if (price <= 0 || listing.status !== "active" || !listing.signature) return null;
  if ((listing.filledQuantity ?? 0) >= (listing.quantity ?? 0)) return null;
  if (listing.deadline && new Date(listing.deadline) <= new Date()) return null;
  return price;
}
