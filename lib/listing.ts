/**
 * When resale listing opens for a collection.
 *
 * The rule is a single fact about the collection, not a setting: resale
 * opens the moment every unit that will ever exist is actually on-chain,
 * and it opens by itself. Nobody — creator or admin — decides it.
 *
 * Two reasons it works this way. Running resale alongside the primary mint
 * means the collection competes with itself: buyers see two prices for the
 * same thing and the creator's own sale is undercut before it finishes. And
 * leaving the switch in the creator's hands lets them hold their own
 * holders hostage after taking their money, which is not a thing a
 * marketplace should make possible.
 *
 * Because it's derived rather than stored, the rule is retroactive without
 * a migration: a collection that had resale flagged open under the old
 * behaviour still can't list until it has genuinely minted out.
 */
export type ListingGateInput = {
  maxSupply: number;
  /** Units actually minted on-chain. */
  mintedSupply: number;
  /** Items that exist in the collection but have never been minted. */
  unmintedCount: number;
};

/**
 * Whether every unit of the collection is on-chain.
 *
 * A capped collection is minted out once its supply is reached. An uncapped
 * one has no such moment, so requiring a cap would lock resale off
 * permanently — there, "minted out" means nothing is still waiting to be
 * minted, and at least one item exists (an empty collection isn't sold out,
 * it's just empty).
 */
export function isMintedOut({ maxSupply, mintedSupply, unmintedCount }: ListingGateInput): boolean {
  if (maxSupply > 0) return mintedSupply >= maxSupply;
  return mintedSupply > 0 && unmintedCount === 0;
}

/** How many units are still to mint before resale opens. */
export function mintRemaining({ maxSupply, mintedSupply, unmintedCount }: ListingGateInput): number {
  return maxSupply > 0 ? Math.max(0, maxSupply - mintedSupply) : unmintedCount;
}

export type ListingGate = {
  /** Resale is open — true exactly when the collection is minted out. */
  open: boolean;
  /** Units still to mint before it opens. Zero once open. */
  remaining: number;
};

export function listingGate(input: ListingGateInput): ListingGate {
  const open = isMintedOut(input);
  return { open, remaining: open ? 0 : mintRemaining(input) };
}
