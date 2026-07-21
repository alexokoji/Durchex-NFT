"use client";

import clsx from "clsx";
import { Zap, Gavel, EyeOff } from "lucide-react";

export type PricingMode = "fixed_price" | "auction" | "not_listed";

const MODES: { value: PricingMode; label: string; desc: string; icon: typeof Zap }[] = [
  { value: "fixed_price", label: "Fixed price", desc: "List instantly at a set price.", icon: Zap },
  { value: "auction", label: "Auction", desc: "Sell to the highest bidder.", icon: Gavel },
  { value: "not_listed", label: "List later", desc: "Save it, list from your profile.", icon: EyeOff },
];

export function PricingForm({
  mode,
  onModeChange,
  priceEth,
  onPriceChange,
  auctionDurationHours,
  onDurationChange,
}: {
  mode: PricingMode;
  onModeChange: (m: PricingMode) => void;
  priceEth: string;
  onPriceChange: (v: string) => void;
  auctionDurationHours: number;
  onDurationChange: (h: number) => void;
}) {
  return (
    <div>
      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => onModeChange(m.value)}
            className={clsx(
              "surface-card p-4 text-left transition",
              mode === m.value ? "border-purple-500/60 ring-1 ring-purple-500/40" : "hover:border-white/20"
            )}
          >
            <m.icon className="w-5 h-5 text-purple-400 mb-2" />
            <div className="text-sm font-semibold text-white mb-0.5">{m.label}</div>
            <div className="text-[11px] text-white/40">{m.desc}</div>
          </button>
        ))}
      </div>

      {mode !== "not_listed" && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-white/50 mb-1.5 block">
              {mode === "auction" ? "Starting bid (ETH)" : "Price (ETH)"}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={priceEth}
              onChange={(e) => onPriceChange(e.target.value)}
              placeholder="0.50"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
            />
          </div>
          {mode === "auction" && (
            <div>
              <label className="text-xs font-medium text-white/50 mb-1.5 block">Duration</label>
              <select
                value={auctionDurationHours}
                onChange={(e) => onDurationChange(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/60"
              >
                <option className="bg-surface-2" value={24}>
                  1 day
                </option>
                <option className="bg-surface-2" value={72}>
                  3 days
                </option>
                <option className="bg-surface-2" value={168}>
                  7 days
                </option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
