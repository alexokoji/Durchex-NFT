import { getRankedCollections, RankingsTimeframe } from "@/lib/queries";
import { RankingsTable } from "@/components/rankings/RankingsTable";
import { TimeframeTabs } from "@/components/rankings/TimeframeTabs";

// Live marketplace data — never prerender a stale snapshot at build time.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ timeframe?: string }>;
}

export default async function RankingsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const timeframe: RankingsTimeframe =
    sp.timeframe === "7d" || sp.timeframe === "all" ? sp.timeframe : "24h";

  const collections = await getRankedCollections(timeframe);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-2">
            Rankings
          </h1>
          <p className="text-white/50 text-sm">
            Top collections by trading volume across Durchex.
          </p>
        </div>
        <TimeframeTabs active={timeframe} />
      </div>

      <RankingsTable collections={collections} timeframe={timeframe} />
    </div>
  );
}
