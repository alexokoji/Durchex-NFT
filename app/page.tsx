import { Hero } from "@/components/home/Hero";
import { TrendingCollections } from "@/components/home/TrendingCollections";
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
} from "@/lib/queries";
import { getCurrentUserFromCookies } from "@/lib/auth/currentUser";

// Reading the viewer's session (for personalized drop-notify state) already
// forces this to render per-request — `revalidate` doesn't apply once a page
// is fully dynamic, so it's omitted rather than left as misleading config.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUserFromCookies();
  const [collections, auctions, creators, stats, categoryCounts, drops] = await Promise.all([
    getTrendingCollections(),
    getLiveAuctions(),
    getTopCreators(),
    getPlatformStats(),
    getCategoryCounts(),
    getDrops(user ? String(user._id) : undefined),
  ]);

  return (
    <div>
      <Hero stats={stats} collections={collections} />
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
