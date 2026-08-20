import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useCurrency } from "@/components/providers/CurrencyProvider";

/**
 * The parent collection's headline numbers, on the item page.
 *
 * Owners and minted supply are chain-derived (see
 * lib/web3/collectionChainStats.ts), so they match what a block explorer
 * shows rather than what passed through Durchex.
 */
export function CollectionSummary({
  summary,
}: {
  summary: {
    slug: string;
    name: string;
    floorEth: number;
    owners: number;
    mintedUnits: number;
    totalVolumeEth: number;
  };
}) {
  const { format } = useCurrency();
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-sm font-semibold text-white truncate">{summary.name}</div>
        <Link
          href={`/collection/${summary.slug}`}
          className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200 transition shrink-0"
        >
          View collection <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Cell label="Floor" value={summary.floorEth > 0 ? format(summary.floorEth) : "—"} />
        <Cell label="Owners" value={summary.owners.toLocaleString()} />
        <Cell label="Minted" value={summary.mintedUnits.toLocaleString()} />
        <Cell
          label="Total volume"
          value={summary.totalVolumeEth > 0 ? format(summary.totalVolumeEth) : "—"}
        />
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-white/35 mb-1">{label}</div>
      <div className="text-sm font-semibold text-white tabular-nums">{value}</div>
    </div>
  );
}
