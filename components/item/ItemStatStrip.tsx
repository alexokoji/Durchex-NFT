"use client";

import { ItemDetailView } from "@/lib/types";
import { useCurrency } from "@/components/providers/CurrencyProvider";

/**
 * The four numbers that describe a token's market at a glance.
 *
 * An em dash where there is no answer, never a zero: "0 ETH floor" reads
 * as free, when what is true is that nothing is listed.
 */
export function ItemStatStrip({
  item,
  topOfferAction,
}: {
  item: ItemDetailView;
  /** Rendered under "best offer" — the holder's one-click sell into it. */
  topOfferAction?: React.ReactNode;
}) {
  const supply = item.standard === "ERC1155" ? item.mintedSupply || item.totalSupply : 1;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
      <Stat label="Best offer" eth={item.bestOfferEth} action={topOfferAction} />
      <Stat label="Last sale" eth={item.lastSalePriceEth} />
      <Stat label="Item floor" eth={item.itemFloorEth} />
      <Stat label="Total supply" raw={supply.toLocaleString()} />
    </div>
  );
}

function Stat({
  label,
  eth,
  raw,
  action,
}: {
  label: string;
  eth?: number | null;
  raw?: string;
  action?: React.ReactNode;
}) {
  const { format, currency, rate } = useCurrency();
  const value = raw ?? (eth !== null && eth !== undefined && eth > 0 ? format(eth) : "—");
  // The secondary line shows the *other* denomination, so a viewer always
  // has both without switching. Nothing to add when there is no rate, or
  // when the figure isn't a price at all.
  const secondary =
    raw || eth === null || eth === undefined || eth <= 0 || !rate
      ? null
      : currency === "USD"
        ? `${Number(eth.toFixed(4))} ETH`
        : `$${(eth * rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-white/35 mb-1">{label}</div>
      <div className="text-sm font-semibold text-white tabular-nums">{value}</div>
      {secondary && <div className="text-[11px] text-white/35 tabular-nums">{secondary}</div>}
      {action}
    </div>
  );
}
