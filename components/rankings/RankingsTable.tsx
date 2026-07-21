import Link from "next/link";
import { BadgeCheck, TrendingUp, TrendingDown } from "lucide-react";
import clsx from "clsx";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { CollectionDetailView } from "@/lib/types";
import { RankingsTimeframe } from "@/lib/queries";

const VOLUME_LABEL: Record<RankingsTimeframe, string> = {
  "24h": "24h Volume",
  "7d": "7d Volume",
  all: "All-Time Volume",
};

function volumeFor(c: CollectionDetailView, timeframe: RankingsTimeframe) {
  return timeframe === "24h" ? c.volume24hEth : timeframe === "7d" ? c.volume7dEth : c.totalVolumeEth;
}

export function RankingsTable({
  collections,
  timeframe,
}: {
  collections: CollectionDetailView[];
  timeframe: RankingsTimeframe;
}) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="hidden sm:grid grid-cols-[2.5rem_1fr_7rem_7rem_6rem_6rem_5rem] gap-3 px-5 py-3 border-b border-white/10 text-[11px] uppercase tracking-wide text-white/40">
        <span>#</span>
        <span>Collection</span>
        <span className="text-right">{VOLUME_LABEL[timeframe]}</span>
        <span className="text-right">Floor</span>
        <span className="text-right">Change</span>
        <span className="text-right">Owners</span>
        <span className="text-right">Items</span>
      </div>
      <div>
        {collections.map((c, i) => {
          const up = c.volumeChangePct >= 0;
          return (
            <Link
              key={c.id}
              href={`/collection/${c.slug}`}
              className="grid grid-cols-[2rem_1fr] sm:grid-cols-[2.5rem_1fr_7rem_7rem_6rem_6rem_5rem] gap-3 items-center px-5 py-3.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition"
            >
              <span
                className={clsx(
                  "text-sm font-semibold",
                  i < 3 ? "text-purple-300" : "text-white/40"
                )}
              >
                {i + 1}
              </span>
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-lg overflow-hidden shrink-0">
                  <GeneratedArt seedKey={`logo-${c.slug}`} className="w-full h-full" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1">
                    <span className="text-sm font-medium text-white truncate">{c.name}</span>
                    {c.verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                  </span>
                  <span className="sm:hidden text-xs text-white/40 tabular-nums">
                    {volumeFor(c, timeframe).toFixed(1)} ETH
                  </span>
                </span>
              </span>
              <span className="hidden sm:block text-right text-sm font-semibold text-white tabular-nums">
                {volumeFor(c, timeframe).toFixed(2)}
              </span>
              <span className="hidden sm:block text-right text-sm text-white/70 tabular-nums">
                {c.floorEth.toFixed(2)} ETH
              </span>
              <span
                className={clsx(
                  "hidden sm:flex items-center justify-end gap-1 text-sm tabular-nums",
                  up ? "text-success" : "text-danger"
                )}
              >
                {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {Math.abs(c.volumeChangePct).toFixed(1)}%
              </span>
              <span className="hidden sm:block text-right text-sm text-white/50 tabular-nums">
                {c.owners.toLocaleString()}
              </span>
              <span className="hidden sm:block text-right text-sm text-white/50 tabular-nums">
                {c.items.toLocaleString()}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
