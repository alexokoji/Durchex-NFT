import { ItemDetailView } from "@/lib/types";

const ETH_USD = 3400;

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
  const value = raw ?? (eth !== null && eth !== undefined && eth > 0 ? `${eth} ETH` : "—");
  const usd = eth !== null && eth !== undefined && eth > 0 ? eth * ETH_USD : null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-white/35 mb-1">{label}</div>
      <div className="text-sm font-semibold text-white tabular-nums">{value}</div>
      {usd !== null && (
        <div className="text-[11px] text-white/35 tabular-nums">
          ${usd < 0.01 ? "<0.01" : usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
      )}
      {action}
    </div>
  );
}
