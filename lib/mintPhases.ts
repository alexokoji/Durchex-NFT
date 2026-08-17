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
 * phases" is presented at creation. allocation > 0 is required to enable a
 * phase (see the PATCH/POST collection routes), so it's a reliable signal
 * that this isn't just the untouched default state.
 */
export function hasConfiguredPhases(mintPhases: MintPhasesLike | undefined): boolean {
  if (!mintPhases) return false;
  return PHASE_KEYS.some((key) => (mintPhases[key]?.allocation ?? 0) > 0);
}

/** The currently-live phase, checked in GTD → FCFS → Public priority order. */
export function pickActivePhase(mintPhases: MintPhasesLike | undefined, now: Date = new Date()): PhaseKey | null {
  if (!mintPhases) return null;
  return PHASE_KEYS.find((key) => isPhaseLive(mintPhases[key], now)) ?? null;
}
