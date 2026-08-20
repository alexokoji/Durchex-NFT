import { getExploreItems, ExploreFilters } from "@/lib/queries";
import { CategoryTabs } from "@/components/explore/CategoryTabs";
import { FilterSidebar } from "@/components/explore/FilterSidebar";
import { Toolbar } from "@/components/explore/Toolbar";
import { InfiniteGrid } from "@/components/explore/InfiniteGrid";
import { LiveRefresh } from "@/components/providers/LiveRefresh";

// Live marketplace data — never prerender a stale snapshot at build time.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ExplorePage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const filters: ExploreFilters = {
    category: sp.category,
    status: sp.status as ExploreFilters["status"],
    sort: (sp.sort as ExploreFilters["sort"]) ?? "recent",
    minPrice: sp.minPrice ? Number(sp.minPrice) : undefined,
    maxPrice: sp.maxPrice ? Number(sp.maxPrice) : undefined,
    page: 1,
    pageSize: 24,
  };

  const { items, total, pageCount } = await getExploreItems(filters);

  const queryString = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]
  ).toString();

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <LiveRefresh />
      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-2">Explore</h1>
        <p className="text-white/50 text-sm max-w-xl">
          Every item across Durchex — live auctions, buy-now listings and unminted lazy
          items, updated in real time.
        </p>
      </div>

      <div className="mb-6">
        <CategoryTabs active={sp.category} searchParams={sp} />
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <FilterSidebar />
        <div className="flex-1 min-w-0">
          <Toolbar total={total} />
          <InfiniteGrid
            key={queryString}
            initialItems={items}
            initialPageCount={pageCount}
            queryString={queryString}
          />
        </div>
      </div>
    </div>
  );
}
