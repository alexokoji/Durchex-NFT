"use client";

import { Lock } from "lucide-react";
import { CountdownTimer } from "@/components/nft/CountdownTimer";
import type { ListingGate } from "@/lib/listing";

/**
 * Public-facing counterpart to the creator's ListingControl: says why the
 * secondary market isn't open here yet, and counts down to it when the
 * creator has scheduled a time.
 */
export function ResaleStatus({ gate }: { gate: ListingGate }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <Lock className="w-4 h-4 text-white/30 shrink-0" />
      <span className="text-xs text-white/60">
        {gate.reason === "minting"
          ? "Resale opens once this collection is fully minted."
          : gate.opensAt
            ? "Resale opens in"
            : "The creator hasn't opened resale for this collection yet."}
      </span>
      {gate.opensAt && <CountdownTimer endsAt={gate.opensAt} compact />}
    </div>
  );
}
