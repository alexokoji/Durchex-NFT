export type MintPhaseInput = {
  enabled?: boolean;
  priceEth?: number;
  allocation?: number;
  walletLimit?: number;
  allowlist?: string[];
};

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
  };
}

export const PHASE_KEYS = ["whitelist", "og", "public"] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];
