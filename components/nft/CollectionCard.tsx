import Link from "next/link";
import { BadgeCheck, TrendingDown, TrendingUp } from "lucide-react";
import clsx from "clsx";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { CollectionView } from "@/lib/types";

export function CollectionCard({ collection, rank }: { collection: CollectionView; rank?: number }) {
  const up = collection.volumeChangePct >= 0;

  return (
    <Link
      href={`/collection/${collection.slug}`}
      // Same reasoning as NFTCard: these render in rows/grids where many
      // can be in the viewport at once, so unconditional prefetch wastes
      // bandwidth on collections the visitor never opens.
      prefetch={false}
      className="group surface-card surface-card-hover block overflow-hidden shrink-0 w-64"
    >
      <div className="relative h-24 overflow-hidden rounded-t-2xl">
        {collection.bannerUrl ? <img src={collection.bannerUrl} alt="" className="w-full h-full object-cover opacity-70" /> : <GeneratedArt seedKey={`banner-${collection.slug}`} className="w-full h-full opacity-70" />}
        {rank && (
          <span className="absolute top-2 left-2 w-6 h-6 rounded-md bg-black/60 backdrop-blur grid place-items-center text-[11px] font-bold text-purple-200 border border-white/10">
            {rank}
          </span>
        )}
        <div className="absolute -bottom-6 left-4 w-14 h-14 rounded-xl overflow-hidden border-2 border-surface shadow-lg">
          {collection.logoUrl ? <img src={collection.logoUrl} alt="" className="w-full h-full object-cover" /> : <GeneratedArt seedKey={`logo-${collection.slug}`} className="w-full h-full" />}
        </div>
      </div>
      <div className="pt-8 px-4 pb-4">
        <div className="flex items-center gap-1 mb-2">
          <h3 className="text-sm font-semibold text-white truncate">{collection.name}</h3>
          {collection.verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
        </div>
        <div className="flex items-center justify-between text-xs">
          <div>
            <div className="text-white/40 mb-0.5">Floor</div>
            <div className="font-bold text-white tabular-nums">{collection.floorEth.toFixed(2)} ETH</div>
          </div>
          <div className="text-right">
            <div className="text-white/40 mb-0.5">24h Vol</div>
            <div
              className={clsx(
                "font-bold tabular-nums flex items-center gap-1 justify-end",
                up ? "text-success" : "text-danger"
              )}
            >
              {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(collection.volumeChangePct).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
