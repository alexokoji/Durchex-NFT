"use client";

import { useState } from "react";
import { useCurrency } from "@/components/providers/CurrencyProvider";

type Point = { date: string; volumeEth: number; sales: number };

/**
 * Traded volume over the last fortnight.
 *
 * Drawn as inline SVG rather than pulling in a charting library: it is one
 * area and one line over at most fourteen points, and a dependency that
 * ships hundreds of kilobytes to draw that would cost every visitor more
 * than it gives them.
 *
 * Every point is a real day of settled sales, including the empty ones.
 * Dropping quiet days would draw a straight line between two distant
 * points and read as steady trading through a week where nothing happened.
 */
export function VolumeChart({ series }: { series: Point[] }) {
  const { format } = useCurrency();
  const [hover, setHover] = useState<number | null>(null);

  const total = series.reduce((sum, p) => sum + p.volumeEth, 0);
  const sales = series.reduce((sum, p) => sum + p.sales, 0);
  if (series.length === 0) return null;

  const W = 720;
  const H = 180;
  const PAD = 8;
  const peak = Math.max(...series.map((p) => p.volumeEth), 0);
  // A flat series still needs a denominator, and an all-zero fortnight
  // should sit on the floor rather than divide by nothing.
  const scale = peak > 0 ? peak : 1;

  const x = (i: number) => (series.length === 1 ? W / 2 : (i / (series.length - 1)) * (W - PAD * 2) + PAD);
  const y = (v: number) => H - PAD - (v / scale) * (H - PAD * 2);

  const line = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.volumeEth)}`).join(" ");
  const area = `${line} L${x(series.length - 1)},${H} L${x(0)},${H} Z`;

  const active = hover !== null ? series[hover] : null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="surface-card p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-semibold text-white">Marketplace volume</h2>
            <p className="text-xs text-white/45 mt-1">Settled sales over the last 14 days</p>
          </div>
          <div className="flex gap-6 sm:gap-8">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/35">Volume</div>
              <div className="font-display text-xl sm:text-2xl font-semibold text-white tabular-nums">
                {format(total, { decimals: 4 })}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/35">Sales</div>
              <div className="font-display text-xl sm:text-2xl font-semibold text-white tabular-nums">
                {sales.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-32 sm:h-44"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Daily traded volume, ${series.length} days`}
          >
            <defs>
              <linearGradient id="vol-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#vol-fill)" />
            <path d={line} fill="none" stroke="#a78bfa" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {hover !== null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD}
                y2={H}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {/* Invisible full-height bands: a one-pixel line is a poor
                target for a pointer and an impossible one for a thumb. */}
            {series.map((p, i) => (
              <rect
                key={p.date}
                x={x(i) - (W / series.length) / 2}
                y={0}
                width={W / series.length}
                height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                // Touch has no hover, so a phone would never see a value.
                onTouchStart={() => setHover(i)}
              />
            ))}
          </svg>

          {active && (
            <div className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none">
              <div className="rounded-lg border border-white/10 bg-surface-1 px-2.5 py-1.5 text-[11px] sm:text-xs whitespace-nowrap">
                <span className="text-white/50">
                  {new Date(active.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                <span className="text-white ml-2 tabular-nums">{format(active.volumeEth, { decimals: 4 })}</span>
                <span className="text-white/40 ml-2 tabular-nums">
                  {active.sales} {active.sales === 1 ? "sale" : "sales"}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between text-[10px] text-white/30 mt-2 tabular-nums">
          <span>{new Date(series[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          <span>
            {new Date(series[series.length - 1].date).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
    </section>
  );
}
