import { Lock } from "lucide-react";

/**
 * Why the secondary market isn't open on this collection yet.
 *
 * Deliberately says nothing about who opens it. A creator can open resale
 * early, but saying so here would tell buyers the secondary market is
 * somebody's to switch off — and once the collection mints out it isn't,
 * by anyone. The guarantee worth communicating is the mint-out one, so
 * that is the only one stated.
 */
export function ResaleStatus({ remaining }: { remaining: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <Lock className="w-4 h-4 text-white/30 shrink-0" />
      <span className="text-xs text-white/70 font-medium">Resale isn&rsquo;t available yet</span>
      <span className="text-xs text-white/45">
        Buying the floor and making collection offers open once every NFT in this collection has
        been minted
        {remaining > 0 ? ` — ${remaining.toLocaleString()} still to mint.` : "."}
      </span>
    </div>
  );
}
