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
 * holders' exits shut after taking their money.
 *
 * Everything here is measured in UNITS, never in item rows — see
 * lib/collectionSupply.ts for why that distinction is load-bearing.
 */
export type ListingGateInput = {
  /** Declared cap in units. Zero means uncapped. */
  maxSupply: number;
  /** Units actually minted on-chain. */
  mintedUnits: number;
  /** Units that exist to be minted at all. */
  totalUnits: number;
};

/**
 * Whether every unit of the collection is on-chain.
 *
 * A capped collection is minted out once its cap is reached. An uncapped
 * one has no cap to reach, so requiring one would lock resale off forever —
 * there, "minted out" means no unit of any item is still waiting, and at
 * least one has been minted (an empty collection isn't sold out, it's
 * just empty).
 */
export function isMintedOut({ maxSupply, mintedUnits, totalUnits }: ListingGateInput): boolean {
  if (maxSupply > 0) return mintedUnits >= maxSupply;
  return mintedUnits > 0 && mintedUnits >= totalUnits;
}

/** How many units are still to mint before resale opens. */
export function mintRemaining({ maxSupply, mintedUnits, totalUnits }: ListingGateInput): number {
  const target = maxSupply > 0 ? maxSupply : totalUnits;
  return Math.max(0, target - mintedUnits);
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

/**
 * Whether one item is fully minted — the condition for its owner listing
 * it for resale.
 *
 * Distinct from the collection gate above. An ERC-1155 of 50 needs all 50
 * on-chain, not just the first one: `isMinted` flips on the first purchase,
 * so it says nothing about whether the edition has finished selling. An
 * ERC-721 is one unit, so being minted is being fully minted.
 */
export type ItemSupply = {
  standard: string;
  isMinted: boolean;
  totalSupply?: number | null;
  mintedSupply?: number | null;
};

export function isItemMintedOut(item: ItemSupply): boolean {
  if (item.standard !== "ERC1155") return item.isMinted;
  const total = item.totalSupply ?? 0;
  const minted = item.mintedSupply ?? 0;
  return total > 0 && minted >= total;
}

/** Units of this item still to mint before its owner can list it. */
export function itemMintRemaining(item: ItemSupply): number {
  if (item.standard !== "ERC1155") return item.isMinted ? 0 : 1;
  return Math.max(0, (item.totalSupply ?? 0) - (item.mintedSupply ?? 0));
}
