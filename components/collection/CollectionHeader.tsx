import { BadgeCheck } from "lucide-react";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { CollectionDetailView } from "@/lib/types";

export function CollectionHeader({ collection }: { collection: CollectionDetailView }) {
  return (
    <div>
      <div className="relative h-48 sm:h-64 overflow-hidden rounded-2xl">
        <GeneratedArt seedKey={`banner-${collection.slug}`} className="w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/10 to-transparent" />
      </div>

      <div className="px-4 sm:px-8 -mt-12 relative flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="w-24 h-24 rounded-2xl overflow-hidden border-4 border-void shadow-xl shrink-0">
          <GeneratedArt seedKey={`logo-${collection.slug}`} className="w-full h-full" />
        </div>
        <div className="pb-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white">
              {collection.name}
            </h1>
            {collection.verified && <BadgeCheck className="w-6 h-6 text-purple-400" />}
          </div>
          <p className="text-sm text-white/50 max-w-xl mt-1.5">{collection.description}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 sm:grid-cols-5 gap-4 px-4 sm:px-8">
        <Stat label="Floor" value={`${collection.floorEth.toFixed(2)} ETH`} />
        <Stat label="24h Volume" value={`${collection.volume24hEth.toFixed(1)} ETH`} />
        <Stat label="Total Volume" value={`${collection.totalVolumeEth.toFixed(0)} ETH`} />
        <Stat label="Items" value={collection.items.toLocaleString()} />
        <Stat label="Owners" value={collection.owners.toLocaleString()} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-white/40 mb-1">{label}</div>
      <div className="font-display text-lg font-semibold text-white tabular-nums">{value}</div>
    </div>
  );
}
