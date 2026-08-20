"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Currency = "ETH" | "USD";

type CurrencyContext = {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** Live ETH/USD, or null when no rate could be fetched. */
  rate: number | null;
  /** Formats an ETH amount in whichever currency is selected. */
  format: (eth: number | null | undefined, opts?: { compact?: boolean }) => string;
};

const Ctx = createContext<CurrencyContext | null>(null);
const STORAGE_KEY = "durchex:currency";

/**
 * Site-wide display currency.
 *
 * Prices are always denominated in ETH — that is what the contracts move
 * and what a signature commits to. This only changes how they are shown,
 * which is why the toggle never touches an input the user types a price
 * into: letting someone enter "50" meaning dollars and signing an order
 * for 50 ETH is not a risk worth taking for the convenience.
 *
 * The rate is fetched once here rather than per component, so a page with
 * forty prices makes one request, and every figure on screen is converted
 * at the same rate instead of drifting apart.
 */
export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("ETH");
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "USD" || stored === "ETH") setCurrencyState(stored);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/eth-price")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => !cancelled && setRate(typeof data?.usd === "number" ? data.usd : null))
        .catch(() => !cancelled && setRate(null));
    load();
    // Long-lived tabs would otherwise price everything at whatever the
    // rate was when the page opened.
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const value = useMemo<CurrencyContext>(() => {
    function setCurrency(next: Currency) {
      setCurrencyState(next);
      window.localStorage.setItem(STORAGE_KEY, next);
    }

    function format(eth: number | null | undefined, opts?: { compact?: boolean }) {
      if (eth === null || eth === undefined) return "—";
      // Falling back to ETH when there is no rate is deliberate: a dollar
      // figure invented from a stale or missing rate misinforms, where ETH
      // is always exactly right.
      if (currency === "USD" && rate) {
        const usd = eth * rate;
        if (usd > 0 && usd < 0.01) return "<$0.01";
        return `$${usd.toLocaleString(undefined, {
          maximumFractionDigits: usd >= 1000 || opts?.compact ? 0 : 2,
        })}`;
      }
      // Small ETH amounts are common here and toFixed(3) rounds them to
      // zero, which reads as free. Show what the number actually is.
      const shown = eth >= 0.001 || eth === 0 ? Number(eth.toFixed(4)) : eth;
      return `${shown} ETH`;
    }

    return { currency, setCurrency, rate, format };
  }, [currency, rate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrency(): CurrencyContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Rendering outside the provider shouldn't crash a page over a
    // formatting concern — fall back to plain ETH.
    return {
      currency: "ETH",
      setCurrency: () => {},
      rate: null,
      format: (eth) => (eth === null || eth === undefined ? "—" : `${eth} ETH`),
    };
  }
  return ctx;
}
