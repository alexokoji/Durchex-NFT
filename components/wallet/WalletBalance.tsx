"use client";

import { useAccount, useBalance } from "wagmi";
import { useCurrency } from "@/components/providers/CurrencyProvider";

/**
 * The connected wallet's spendable ETH, in the header.
 *
 * Every price on this site is asking someone to spend, and until now they
 * had to leave and open their wallet to know whether they could. Showing
 * it here answers the question at the moment it gets asked.
 *
 * Deliberately the native balance only, not WETH or holdings — this is
 * "what can I pay with right now", and mixing wrapped balances into that
 * would overstate it, since most flows here spend ETH directly.
 */
export function WalletBalance() {
  const { address, chainId } = useAccount();
  const { currency, rate } = useCurrency();

  const { data, isLoading } = useBalance({
    address,
    chainId,
    query: {
      enabled: !!address,
      // Balances move whenever the user transacts, and a stale figure in
      // the header is worse than none — it invites a purchase that fails.
      refetchInterval: 20_000,
      staleTime: 10_000,
    },
  });

  if (!address) return null;

  const eth = data ? Number(data.formatted) : null;
  const label =
    eth === null
      ? isLoading
        ? "…"
        : null
      : currency === "USD" && rate
        ? `$${(eth * rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        // Four places: a balance rounded to two reads as 0.00 for anyone
        // holding less than a cent of ETH, which is most new wallets here.
        : `${Number(eth.toFixed(4))} ETH`;

  if (label === null) return null;

  return (
    <span
      className="hidden sm:inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/80 tabular-nums"
      title={eth !== null ? `${eth} ETH` : undefined}
    >
      {label}
    </span>
  );
}
