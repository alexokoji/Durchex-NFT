/**
 * When resale listing is allowed to open for a collection.
 *
 * The rule is that a collection must be fully minted out — every unit that
 * will ever exist actually on-chain — before any of its owners can list.
 * Until then the primary mint is still running, and letting resale run
 * alongside it means the collection competes with itself: buyers see two
 * prices for the same thing and the creator's own sale is undercut before
 * it finishes.
 *
 * Mint-out is a precondition, not a stored flag. That matters because it
 * makes the rule retroactive without a migration — a collection whose
 * listingEnabled was set true under the old behaviour still can't list
 * until it has actually sold out.
 */
export type ListingGateInput = {
  maxSupply: number;
  /** Units actually minted on-chain. */
  mintedSupply: number;
  /** Items that exist in the collection but have never been minted. */
  unmintedCount: number;
  listingEnabled: boolean;
  listingOpensAt: string | Date | null;
};

/**
 * Whether every unit of the collection is on-chain.
 *
 * A capped collection is minted out once its supply is reached. An uncapped
 * one has no such moment, so requiring a cap would lock listing off
 * permanently — there, "minted out" means nothing is still waiting to be
 * minted, and at least one item exists (an empty collection isn't sold out,
 * it's just empty).
 */
export function isMintedOut({ maxSupply, mintedSupply, unmintedCount }: Pick<ListingGateInput, "maxSupply" | "mintedSupply" | "unmintedCount">): boolean {
  if (maxSupply > 0) return mintedSupply >= maxSupply;
  return mintedSupply > 0 && unmintedCount === 0;
}

export type ListingGate = {
  /** Every unit is on-chain — the precondition for listing at all. */
  mintedOut: boolean;
  /** Listing is open right now. */
  open: boolean;
  /** When listing opens on a schedule, if one is set and still in future. */
  opensAt: string | null;
  /** Why listing isn't open, for showing the owner instead of nothing. */
  reason: "minting" | "not_opened" | "scheduled" | null;
};

export function listingGate(input: ListingGateInput, now: Date = new Date()): ListingGate {
  const mintedOut = isMintedOut(input);
  const scheduled = input.listingOpensAt ? new Date(input.listingOpensAt) : null;
  const scheduleReached = !!scheduled && scheduled <= now;

  if (!mintedOut) {
    // A schedule set before mint-out is deliberately ignored rather than
    // honoured early — mint-out is the gate, the timer only refines it.
    return { mintedOut: false, open: false, opensAt: null, reason: "minting" };
  }

  const open = input.listingEnabled || scheduleReached;
  if (open) return { mintedOut: true, open: true, opensAt: null, reason: null };

  return {
    mintedOut: true,
    open: false,
    opensAt: scheduled && !scheduleReached ? scheduled.toISOString() : null,
    reason: scheduled && !scheduleReached ? "scheduled" : "not_opened",
  };
}
