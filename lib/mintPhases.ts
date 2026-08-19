export type MintPhaseInput = {
  enabled?: boolean;
  priceEth?: number;
  allocation?: number;
  walletLimit?: number;
  allowlist?: string[];
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
};

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizePhase(input: MintPhaseInput | undefined, requiresAllowlist = false) {
  const enabled = !!input?.enabled;
  const allowlist = [
    ...new Set(
      (input?.allowlist ?? [])
        .map((address) => String(address).trim().toLowerCase())
        .filter((address) => /^0x[a-f0-9]{40}$/.test(address))
    ),
  ];
  return {
    enabled,
    priceEth: Math.max(0, Number(input?.priceEth ?? 0)),
    allocation: Math.max(0, Math.floor(Number(input?.allocation ?? 0))),
    walletLimit: Math.max(0, Math.floor(Number(input?.walletLimit ?? 0))),
    allowlist: requiresAllowlist ? allowlist : [],
    startsAt: normalizeDate(input?.startsAt),
    endsAt: normalizeDate(input?.endsAt),
  };
}

export const PHASE_KEYS = ["whitelist", "og", "public"] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];

// "whitelist" is GTD — allowlisted wallets are each guaranteed their
// walletLimit, no risk of a shared pool running dry before they claim.
// "og" and "public" are FCFS — a shared allocation, first come first
// served, and the phase should auto-close once it's sold out.
export const PHASE_LABELS: Record<PhaseKey, string> = {
  whitelist: "GTD mint",
  og: "FCFS mint",
  public: "Public mint",
};
export const RACES_ALLOCATION: Record<PhaseKey, boolean> = {
  whitelist: false,
  og: true,
  public: true,
};

type PhaseLike = { enabled?: boolean; startsAt?: Date | string | null; endsAt?: Date | string | null };

/** Whether a phase is actually live right now — enabled, and (if set) within its scheduled window. */
export function isPhaseLive(phase: PhaseLike | undefined, now: Date = new Date()): boolean {
  if (!phase?.enabled) return false;
  if (phase.startsAt && now < new Date(phase.startsAt)) return false;
  if (phase.endsAt && now > new Date(phase.endsAt)) return false;
  return true;
}

type ConfiguredPhaseLike = { allocation?: number; enabled?: boolean; startsAt?: Date | string | null; endsAt?: Date | string | null };
type MintPhasesLike = Record<PhaseKey, ConfiguredPhaseLike | undefined>;

/**
 * Whether the creator has ever set up phases for this collection at all.
 * Phases are optional — a collection that's never touched them should mint
 * exactly like it always did (no gating), matching how "Optional mint
 * phases" is presented at creation. allocation > 0 is required to enable
 * GTD/FCFS (see the PATCH/POST collection routes), so it's a reliable
 * signal for those two. Public has no allocation of its own to check (its
 * supply is derived, see computePublicAllocation) — its own enabled flag
 * is the signal instead.
 */
export function hasConfiguredPhases(mintPhases: MintPhasesLike | undefined): boolean {
  if (!mintPhases) return false;
  return (mintPhases.whitelist?.allocation ?? 0) > 0 || (mintPhases.og?.allocation ?? 0) > 0 || !!mintPhases.public?.enabled;
}

/**
 * Public has no allocation of its own — it opens up whatever's left of the
 * collection's supply after GTD + FCFS. If the collection has no maxSupply
 * cap (0 = unlimited), Public is uncapped too, regardless of what GTD/FCFS
 * reserved. Returns 0 to mean "unlimited", matching the existing
 * allocation convention everywhere else.
 */
export function computePublicAllocation(maxSupply: number, whitelistAllocation: number, ogAllocation: number): number {
  if (!maxSupply || maxSupply <= 0) return 0;
  return Math.max(0, maxSupply - whitelistAllocation - ogAllocation);
}

type ReservingPhaseLike = {
  enabled?: boolean;
  allocation?: number;
  minted?: number;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
};

/**
 * How much supply a GTD/FCFS phase is still holding back from Public.
 *
 * A phase only reserves its full allocation while it could still mint. Once
 * it's finished — turned off, past its end time, or sold out — the only
 * supply it has actually consumed is what it minted, and the unminted
 * remainder belongs to Public. Without this, a launch that reserves 100%
 * across GTD + FCFS and then ends with supply unsold would strand that
 * supply permanently: Public's allocation would stay 0 and, because the
 * collection routes force `enabled: false` when the derived allocation is
 * 0, Public could never be opened at all.
 */
export function supplyReservedByPhase(phase: ReservingPhaseLike | undefined, now: Date = new Date()): number {
  const allocation = Math.max(0, phase?.allocation ?? 0);
  const minted = Math.max(0, phase?.minted ?? 0);
  if (allocation === 0) return minted;

  const soldOut = minted >= allocation;
  const ended = !!phase?.endsAt && now > new Date(phase.endsAt);
  const stillClaimable = !!phase?.enabled && !ended && !soldOut;

  return stillClaimable ? allocation : minted;
}

/**
 * Public's live allocation, accounting for supply rolled over from GTD/FCFS
 * phases that have finished. Derived at read time rather than stored,
 * because the rollover is partly time-based — a phase can lapse with no one
 * touching the collection, and a value computed only when a creator last
 * edited would never reflect that.
 *
 * Returns 0 for "unlimited", matching the convention everywhere else.
 */
export function effectivePublicAllocation(
  collection: { maxSupply?: number; mintPhases?: MintPhasesLike & { public?: ReservingPhaseLike } } | undefined,
  now: Date = new Date()
): number {
  const maxSupply = collection?.maxSupply ?? 0;
  if (maxSupply <= 0) return 0; // uncapped collection — Public is uncapped too
  const reserved =
    supplyReservedByPhase(collection?.mintPhases?.whitelist as ReservingPhaseLike, now) +
    supplyReservedByPhase(collection?.mintPhases?.og as ReservingPhaseLike, now);
  return Math.max(0, maxSupply - reserved);
}

/**
 * All phases can run concurrently — GTD, FCFS and Public aren't a sequence,
 * each one's own enabled flag and (optional) end time decide when it
 * closes independently. This returns every phase that's currently live;
 * the buyer then picks whichever one they're eligible for (or Public, if
 * they're not eligible for GTD/FCFS) — see the eligibility route.
 */
export function listLivePhases(mintPhases: MintPhasesLike | undefined, now: Date = new Date()): PhaseKey[] {
  if (!mintPhases) return [];
  return PHASE_KEYS.filter((key) => isPhaseLive(mintPhases[key], now));
}

/**
 * Whether the collection's fixed supply has been minted out completely —
 * the point where secondary-market actions (buying the floor, making a
 * collection-wide offer) start to make sense instead of competing with the
 * primary mint for attention. A collection with no supply cap (maxSupply 0,
 * the default for a plain lazy-mint collection that never configured
 * phases) never reaches this state and is treated as always available for
 * those actions, same as before this existed.
 */
export function isCollectionSoldOut(collection: { maxSupply: number; mintedSupply: number }): boolean {
  return collection.maxSupply > 0 && collection.mintedSupply >= collection.maxSupply;
}
