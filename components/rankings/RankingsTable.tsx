"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown } from "lucide-react";
import clsx from "clsx";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { CollectionDetailView } from "@/lib/types";
import { RankingsTimeframe } from "@/lib/queries";

const VOLUME_LABEL: Record<RankingsTimeframe, string> = {
  "24h": "24h volume",
  "7d": "7d volume",
  all: "All-time volume",
};

/**
 * A day-on-day change, written so it can be read at a glance.
 *
 * Percentages stop being legible somewhere past a few hundred: a
 * collection that traded almost nothing yesterday and a lot today
 * genuinely is up eleven thousand percent, and printing that reads as a
 * bug rather than a number. Past 1000% it becomes a multiple, which is
 * how anyone would say it out loud.
 */
function changeLabel(pct: number): string {
  const abs = Math.abs(pct);
  if (abs >= 1000) return `${(abs / 100).toFixed(abs >= 10000 ? 0 : 1)}×`;
  return `${abs.toFixed(1)}%`;
}

function volumeFor(c: CollectionDetailView, timeframe: RankingsTimeframe) {
  return timeframe === "24h" ? c.volume24hEth : timeframe === "7d" ? c.volume7dEth : c.totalVolumeEth;
}

/**
 * Collections ranked by traded volume.
 *
 * Every figure is measured: volume and sales are summed from settled
 * sales, the floor is the cheapest live listing, and change compares the
 * last day against the one before it. Change in particular used to be a
 * stored field nobody ever wrote, so every row reported a confident 0.0%.
 *
 * Prices run through the currency formatter rather than toFixed(2), which
 * rounded a real 0.00093 floor to 0.00 and made cheap collections look
 * free.
 *
 * On a narrow screen the columns collapse to the two that decide whether
 * you tap a row — volume and floor — under the name, rather than being
 * squeezed to unreadable or hidden entirely.
 */
export function RankingsTable({
  collections,
  timeframe,
}: {
  collections: CollectionDetailView[];
  timeframe: RankingsTimeframe;
}) {
  const { format } = useCurrency();

  if (collections.length === 0) {
    return (
      <div className="surface-card p-10 text-center text-sm text-white/40">
        No collections have traded in this period yet.
      </div>
    );
  }

  const COLS =
    "grid-cols-[1.75rem_1fr] lg:grid-cols-[2.5rem_minmax(0,1fr)_8rem_7rem_5.5rem_5rem_5rem_5rem]";

  return (
    <div className="surface-card overflow-hidden">
      <div
        className={clsx(
          "hidden lg:grid gap-3 px-5 py-3 border-b border-white/10 text-[11px] uppercase tracking-wide text-white/40",
          COLS
        )}
      >
        <span>#</span>
        <span>Collection</span>
        <span className="text-right">{VOLUME_LABEL[timeframe]}</span>
        <span className="text-right">Floor</span>
        <span className="text-right">Change</span>
        <span className="text-right">Sales</span>
        <span className="text-right">Owners</span>
        <span className="text-right">Items</span>
      </div>

      <div>
        {collections.map((c, i) => {
          const volume = volumeFor(c, timeframe);
          const up = c.volumeChangePct >= 0;
          return (
            <Link
              key={c.id}
              href={`/collection/${c.slug}`}
              className={clsx(
                "grid gap-3 items-center px-4 sm:px-5 py-3.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition",
                COLS
              )}
            >
              <span
                className={clsx(
                  "text-sm font-semibold tabular-nums",
                  i < 3 ? "text-purple-300" : "text-white/40"
                )}
              >
                {i + 1}
              </span>

              <span className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-black">
                  {c.logoUrl ? (
                    <img src={c.logoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <GeneratedArt seedKey={`logo-${c.slug}`} className="w-full h-full" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1">
                    <span className="text-sm font-medium text-white truncate">{c.name}</span>
                    <VerifiedBadge tier={c.creatorTier} className="w-3.5 h-3.5" />
                  </span>
                  {/* The two numbers worth a tap decision, for screens too
                      narrow to carry the full row. */}
                  <span className="lg:hidden flex items-center gap-2 text-[11px] tabular-nums mt-0.5">
                    <span className="text-white/70">{format(volume, { decimals: 3 })}</span>
                    <span className="text-white/30">·</span>
                    <span className="text-white/45">
                      {c.floorEth > 0 ? `${format(c.floorEth, { decimals: 4 })} floor` : "no floor"}
                    </span>
                    {c.volumeChangePct !== 0 && (
                      <span className={up ? "text-success" : "text-danger"}>
                        {up ? "+" : "−"}
                        {changeLabel(c.volumeChangePct)}
                      </span>
                    )}
                  </span>
                </span>
              </span>

              <span className="hidden lg:block text-right text-sm font-semibold text-white tabular-nums">
                {format(volume, { decimals: 3 })}
              </span>
              <span className="hidden lg:block text-right text-sm text-white/70 tabular-nums">
                {c.floorEth > 0 ? format(c.floorEth, { decimals: 4 }) : "—"}
              </span>
              <span
                className={clsx(
                  "hidden lg:flex items-center justify-end gap-1 text-sm tabular-nums",
                  c.volumeChangePct === 0 ? "text-white/30" : up ? "text-success" : "text-danger"
                )}
              >
                {c.volumeChangePct === 0 ? (
                  "—"
                ) : (
                  <>
                    {up ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {changeLabel(c.volumeChangePct)}
                  </>
                )}
              </span>
              <span className="hidden lg:block text-right text-sm text-white/50 tabular-nums">
                {c.sales.toLocaleString()}
              </span>
              <span className="hidden lg:block text-right text-sm text-white/50 tabular-nums">
                {c.owners.toLocaleString()}
              </span>
              <span className="hidden lg:block text-right text-sm text-white/50 tabular-nums">
                {c.items.toLocaleString()}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
