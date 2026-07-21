import { StatWidget } from "@/components/nft/StatWidget";
import { Coins, Layers, Users2, Boxes } from "lucide-react";

export function StatsBand({
  stats,
}: {
  stats: { totalVolumeEth: number; totalItems: number; totalOwners: number; collections: number };
}) {
  return (
    <section className="border-y border-white/5 bg-gradient-to-b from-surface/60 to-void">
      <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-2 sm:grid-cols-4 gap-8">
        <StatWidget
          label="Total Volume"
          value={stats.totalVolumeEth.toFixed(0)}
          suffix="ETH"
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
