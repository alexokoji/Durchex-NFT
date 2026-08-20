"use client";

import clsx from "clsx";
import { useCurrency } from "@/components/providers/CurrencyProvider";

/**
 * Switches how prices are displayed across the whole site.
 *
 * Hidden when no exchange rate could be fetched: offering a USD option
 * that silently keeps showing ETH is worse than not offering it at all.
 */
export function CurrencyToggle({ className }: { className?: string }) {
  const { currency, setCurrency, rate } = useCurrency();
  if (!rate) return null;

  return (
    <div
      className={clsx("inline-flex items-center rounded-lg border border-white/10 p-0.5", className)}
      role="group"
      aria-label="Display currency"
    >
      {(["ETH", "USD"] as const).map((c) => (
        <button
          key={c}
          onClick={() => setCurrency(c)}
          aria-pressed={currency === c}
          title={
            c === "USD"
              ? `1 ETH ≈ $${rate.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : undefined
          }
          className={clsx(
            "px-2 py-1 text-[11px] font-medium rounded-md transition",
            currency === c ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
