import { Hero } from "@/components/home/Hero";
import { TrendingCollections } from "@/components/home/TrendingCollections";
import { VolumeChart } from "@/components/home/VolumeChart";
import { LiveAuctions } from "@/components/home/LiveAuctions";
import { TopCreators } from "@/components/home/TopCreators";
import { FeaturedDrops } from "@/components/home/FeaturedDrops";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { HowLazyMintingWorks } from "@/components/home/HowLazyMintingWorks";
import { StatsBand } from "@/components/home/StatsBand";
import { NewsletterCTA } from "@/components/home/NewsletterCTA";
import {
  getTrendingCollections,
  getLiveAuctions,
  getTopCreators,
  getPlatformStats,
  getCategoryCounts,
  getDrops,
  getVolumeSeries,
} from "@/lib/queries";
import { getCurrentUserFromCookies } from "@/lib/auth/currentUser";
import { LiveRefresh } from "@/components/providers/LiveRefresh";

// Reading the viewer's session (for personalized drop-notify state) already
// forces this to render per-request — `revalidate` doesn't apply once a page
// is fully dynamic, so it's omitted rather than left as misleading config.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUserFromCookies();
  const [collections, auctions, creators, stats, categoryCounts, drops, volumeSeries] = await Promise.all([
    getTrendingCollections(),
    getLiveAuctions(),
    getTopCreators(),
    getPlatformStats(),
    getCategoryCounts(),
    getDrops(user ? String(user._id) : undefined),
    getVolumeSeries(14),
  ]);

  return (
    <div>
      <LiveRefresh />
      <Hero stats={stats} collections={collections} />
      <VolumeChart series={volumeSeries} />
      <TrendingCollections collections={collections} />
      <LiveAuctions items={auctions} />
      <TopCreators creators={creators} />
      <FeaturedDrops drops={drops} />
      <CategoryGrid counts={categoryCounts} />
      <HowLazyMintingWorks />
      <StatsBand stats={stats} />
      <NewsletterCTA />
    </div>
  );
}
