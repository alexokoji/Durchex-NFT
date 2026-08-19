import { isPhaseLive } from "@/lib/mintPhases";
import { listingGate, type ListingGate } from "@/lib/listing";
import { collectionMintProgress } from "@/lib/collectionSupply";

type PhasesLike = {
  whitelist?: { enabled?: boolean; startsAt?: Date | string | null; endsAt?: Date | string | null };
  og?: { enabled?: boolean; startsAt?: Date | string | null; endsAt?: Date | string | null };
  public?: { enabled?: boolean; startsAt?: Date | string | null; endsAt?: Date | string | null };
};

/** Which mint phases are running, in the terms the resale gate cares about. */
export function phaseState(mintPhases: PhasesLike | undefined, now: Date = new Date()) {
  return {
    exclusivePhaseLive:
      isPhaseLive(mintPhases?.whitelist, now) || isPhaseLive(mintPhases?.og, now),
    publicPhaseLive: isPhaseLive(mintPhases?.public, now),
  };
}

/**
 * The one place that answers "is this collection's secondary market open?".
 *
 * Every route and page asked this slightly differently and drifted apart —
 * a creator could enable resale, see it live on the collection page, and
 * still be unable to list, because the item route was applying its own
 * extra condition. One function, one answer.
 */
export async function resaleGateFor(collection: {
  _id: unknown;
  maxSupply?: number;
  listingEnabled?: boolean;
  mintPhases?: PhasesLike;
}): Promise<ListingGate> {
  const progress = await collectionMintProgress(collection._id as string);
  return listingGate({
    maxSupply: collection.maxSupply ?? 0,
    ...progress,
    listingEnabled: collection.listingEnabled,
    ...phaseState(collection.mintPhases),
  });
}

/** Why resale is shut, phrased for whoever is being turned away. */
export function resaleClosedReason(gate: ListingGate): string {
  if (gate.exclusiveWindow) {
    return "Resale is paused while the allowlist mint is running. It opens when the public mint starts.";
  }
  return `Resale isn't available for this collection yet — ${gate.remaining.toLocaleString()} still to mint.`;
}
