"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Crown, Rocket, Loader2 } from "lucide-react";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import type { LeaderboardRow, LeaderboardWindow, LeaderboardMode } from "@/lib/queries";

const WINDOWS: LeaderboardWindow[] = ["15m", "1h", "3h", "1d", "7d"];
const ROWS = 10;

/**
 * What is trading on Durchex, over a window the visitor picks.
 *
 * Replaces the 14-day volume chart. The chart answered one question —
 * roughly how much has traded lately — and answered it the same way on
 * every visit. A leaderboard answers which collections, at what floor,
 * moving how fast, and lets someone look at fifteen minutes or seven days.
 *
 * Two columns of five on a wide screen, one column on a phone, so the ten
 * rows stay readable rather than shrinking to fit.
 *
 * Every figure is measured. Volume is summed from settled sales inside the
 * window, floor is the cheapest fillable listing, and change compares the
 * window against the one immediately before it. A collection that did not
 * trade shows a real zero instead of being hidden, because a quiet market
 * is information too — and an empty panel just reads as broken.
 */
export function DataTracking({ initialRows }: { initialRows: LeaderboardRow[] }) {
  const { format } = useCurrency();
  const [mode, setMode] = useState<LeaderboardMode>("top");
  const [window, setWindow] = useState<LeaderboardWindow>("1d");
  const [rows, setRows] = useState<LeaderboardRow[]>(initialRows);
  const [loading, setLoading] = useState(false);

  // The server already rendered 1d/top, so skip refetching that exact view
  // on mount and only go to the network when the visitor changes something.
  const isInitialView = mode === "top" && window === "1d";
  useEffect(() => {
    if (isInitialView) {
      setRows(initialRows);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leaderboard?window=${window}&mode=${mode}&limit=${ROWS}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => !cancelled && setRows(data?.rows ?? []))
      .catch(() => !cancelled && setRows([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mode, window, isInitialView, initialRows]);

  const columns = [rows.slice(0, 5), rows.slice(5, ROWS)];

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="font-display text-xl sm:text-2xl font-semibold text-white">Real time data tracking</h2>
        <Link
          href="/rankings"
          className="text-xs rounded-lg border border-white/10 px-3 py-2 text-white/60 hover:text-white hover:border-white/20 transition"
        >
          View all
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <Tab active={mode === "top"} onClick={() => setMode("top")} icon={Crown} label="Top" />
          <Tab active={mode === "trending"} onClick={() => setMode("trending")} icon={Rocket} label="Trending" />
        </div>

        {/* One control, not five buttons in a row on a phone — the group
            scrolls sideways inside itself rather than widening the page. */}
        <div className="flex items-center rounded-lg border border-white/10 overflow-x-auto no-scrollbar">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={clsx(
                "px-3 py-1.5 text-xs transition shrink-0 border-r border-white/10 last:border-r-0",
                window === w ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
              )}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="surface-card overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-void/50 backdrop-blur-[1px]">
            <Loader2 className="w-5 h-5 animate-spin text-white/50" />
          </div>
        )}

        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-white/40">
            {mode === "trending"
              ? `Nothing has traded in the last ${window}. Try a longer window.`
              : "No collections yet."}
          </p>
        ) : (
          <div className="grid lg:grid-cols-2">
            {columns.map((column, columnIndex) => (
              <div
                key={columnIndex}
                className={clsx(
                  column.length === 0 && "hidden",
                  columnIndex === 1 && "lg:border-l border-white/8"
                )}
              >
                <div className="hidden sm:grid grid-cols-[2rem_minmax(0,1fr)_6rem_6rem] gap-3 px-4 py-2.5 border-b border-white/8 text-[11px] uppercase tracking-wide text-white/35">
                  <span />
                  <span>Collection</span>
                  <span className="text-right">Floor</span>
                  <span className="text-right">Volume</span>
                </div>
                {column.map((row, i) => (
                  <Row
                    key={row.id}
                    row={row}
                    rank={columnIndex * 5 + i + 1}
                    format={format}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Tab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Crown;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
        active ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function Row({
  row,
  rank,
  format,
}: {
  row: LeaderboardRow;
  rank: number;
  format: (eth: number | null | undefined, opts?: { compact?: boolean; decimals?: number }) => string;
}) {
  return (
    <Link
      href={`/collection/${row.slug}`}
      className="grid grid-cols-[2rem_minmax(0,1fr)_auto] sm:grid-cols-[2rem_minmax(0,1fr)_6rem_6rem] gap-3 items-center px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition"
    >
      <span
        className={clsx(
          "text-sm font-semibold tabular-nums",
          rank <= 3 ? "text-purple-300" : "text-white/35"
        )}
      >
        {rank}
      </span>

      <span className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-black">
          {row.logoUrl ? (
            <img src={row.logoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <GeneratedArt seedKey={`logo-${row.slug}`} className="w-full h-full" />
          )}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1">
            <span className="text-sm font-medium text-white truncate">{row.name}</span>
            <VerifiedBadge tier={row.creatorTier} className="w-3.5 h-3.5" />
          </span>
          {/* Narrow screens lose the two right-hand columns, so the same
              numbers ride under the name instead of disappearing. */}
          <span className="sm:hidden flex items-center gap-2 text-[11px] tabular-nums mt-0.5">
            <span className="text-white/70">
              {row.floorEth > 0 ? format(row.floorEth, { decimals: 4 }) : "no floor"}
            </span>
            <span className="text-white/25">·</span>
            <span className="text-white/45">{format(row.volumeEth, { decimals: 3 })}</span>
          </span>
        </span>
      </span>

      <span className="hidden sm:block text-right text-sm text-white/70 tabular-nums">
        {row.floorEth > 0 ? format(row.floorEth, { decimals: 4 }) : "—"}
      </span>

      <span className="text-right text-sm font-semibold text-white tabular-nums">
        {format(row.volumeEth, { decimals: 3 })}
      </span>
    </Link>
  );
}
