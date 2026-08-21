import { Coins, Layers, Users2, Boxes } from "lucide-react";
import { getPlatformStats, getCategoryCounts, getRankedCollections } from "@/lib/queries";
import { StatWidget } from "@/components/nft/StatWidget";
import { CategoryBreakdown } from "@/components/stats/CategoryBreakdown";
import { RankingsTable } from "@/components/rankings/RankingsTable";
import { Button } from "@/components/ui/Button";
import { formatEthAmount } from "@/lib/formatEth";

// Live marketplace data — never prerender a stale snapshot at build time.
export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const [stats, categoryCounts, topCollections] = await Promise.all([
    getPlatformStats(),
    getCategoryCounts(),
    getRankedCollections("all", 5),
  ]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-2">
        Platform Stats
      </h1>
      <p className="text-white/50 text-sm mb-8">A live snapshot of activity across Durchex.</p>

      <div className="surface-card p-6 grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
        <StatWidget
          label="Total Volume"
          value={formatEthAmount(stats.totalVolumeEth, 3)}
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

      <div className="grid lg:grid-cols-2 gap-6">
        <CategoryBreakdown counts={categoryCounts} />

        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-white">Top Collections</h2>
            <Button href="/rankings" variant="ghost" size="sm">
              View all
            </Button>
          </div>
          <RankingsTable collections={topCollections} timeframe="all" />
        </div>
      </div>
    </div>
  );
}
