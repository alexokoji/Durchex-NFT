import { Lock } from "lucide-react";

/**
 * Why the secondary market isn't open on this collection yet.
 *
 * Resale opens on its own the moment every unit in the collection is
 * on-chain, so this is a progress note rather than a decision anyone is
 * waiting on — the copy avoids implying the creator could open it sooner.
 */
export function ResaleStatus({ remaining }: { remaining: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <Lock className="w-4 h-4 text-white/30 shrink-0" />
      <span className="text-xs text-white/70 font-medium">Resale isn&rsquo;t available yet</span>
      <span className="text-xs text-white/45">
        Buying the floor and making collection offers open automatically once every NFT in this
        collection has been minted
        {remaining > 0 ? ` — ${remaining.toLocaleString()} still to mint.` : "."}
      </span>
    </div>
  );
}
