/**
 * When resale listing opens for a collection.
 *
 * Resale opens in one of two ways, and the second one is a ratchet:
 *
 *  1. The creator opens it early, while the primary mint is still running.
 *     Some launches want a live secondary market from day one; that is
 *     their call to make, since it is their sale being competed with.
 *  2. The collection mints out. At that moment resale opens permanently
 *     and the creator's switch stops mattering — they keep their royalty
 *     on every future sale and nothing else. A creator who could close
 *     resale after taking everyone's money would be holding their own
 *     holders' exits shut, so that power ends the moment the mint does.
 *
 * The ratchet is why `open` is computed rather than stored: no sequence of
 * writes can take a minted-out collection back to closed.
 *
 * Everything here is measured in UNITS, never in item rows — see
 * lib/collectionSupply.ts for why that distinction is load-bearing.
 */
export type SupplyInput = {
  /** Declared cap in units. Zero means uncapped. */
  maxSupply: number;
  /** Units actually minted on-chain. */
  mintedUnits: number;
  /** Units that exist to be minted at all. */
  totalUnits: number;
};

export type ListingGateInput = SupplyInput & {
  /** The creator's early-open switch. Irrelevant once minted out. */
  listingEnabled?: boolean;
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
export function isMintedOut({ maxSupply, mintedUnits, totalUnits }: SupplyInput): boolean {
  if (maxSupply > 0) return mintedUnits >= maxSupply;
  return mintedUnits > 0 && mintedUnits >= totalUnits;
}

/** How many units are still to mint before resale opens. */
export function mintRemaining({ maxSupply, mintedUnits, totalUnits }: SupplyInput): number {
  const target = maxSupply > 0 ? maxSupply : totalUnits;
  return Math.max(0, target - mintedUnits);
}

export type ListingGate = {
  /** Resale is open, by either route. */
  open: boolean;
  /** Every unit is on-chain — the point the creator's switch stops counting. */
  mintedOut: boolean;
  /** Whether the creator's switch still has any effect. */
  creatorControls: boolean;
  /** Units still to mint. Zero once minted out. */
  remaining: number;
};

export function listingGate(input: ListingGateInput): ListingGate {
  const mintedOut = isMintedOut(input);
  return {
    open: mintedOut || !!input.listingEnabled,
    mintedOut,
    creatorControls: !mintedOut,
    remaining: mintedOut ? 0 : mintRemaining(input),
  };
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
