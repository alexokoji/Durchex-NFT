"use client";

import { StatWidget } from "@/components/nft/StatWidget";
import { Coins, Layers, Users2, Boxes } from "lucide-react";
import { useCurrency } from "@/components/providers/CurrencyProvider";

export function StatsBand({
  stats,
}: {
  stats: { totalVolumeEth: number; totalItems: number; totalOwners: number; collections: number };
}) {
  const { format } = useCurrency();
  return (
    <section className="border-y border-white/5 bg-gradient-to-b from-surface/60 to-void">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
        {/* Formatted rather than rounded to whole ETH — toFixed(0) turned
            every real total under 0.5 into "0 ETH". */}
        <StatWidget
          label="Total Volume"
          value={format(stats.totalVolumeEth, { decimals: 3 })}
          icon={<Coins className="w-4 h-4" />}
        />
        <StatWidget
          label="NFTs Minted"
          value={stats.totalItems.toLocaleString()}
          icon={<Layers className="w-4 h-4" />}
        />
        <StatWidget
          label="Active Wallets"
          value={stats.totalOwners.toLocaleString()}
          icon={<Users2 className="w-4 h-4" />}
        />
        <StatWidget
          label="Collections"
          value={stats.collections.toString()}
          icon={<Boxes className="w-4 h-4" />}
        />
      </div>
    </section>
  );
}
