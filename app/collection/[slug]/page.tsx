import { notFound } from "next/navigation";
import {
  getCollectionBySlug,
  getCollectionTraitFacets,
  getExploreItems,
  ExploreFilters,
} from "@/lib/queries";
import { CollectionHeader } from "@/components/collection/CollectionHeader";
import { FilterSidebar } from "@/components/explore/FilterSidebar";
import { Toolbar } from "@/components/explore/Toolbar";
import { InfiniteGrid } from "@/components/explore/InfiniteGrid";
import { LiveRefresh } from "@/components/providers/LiveRefresh";

// Live marketplace data — never prerender a stale snapshot at build time.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function CollectionPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const collection = await getCollectionBySlug(slug);
  if (!collection) notFound();

  let traits: ExploreFilters["traits"];
  if (sp.traits) {
    try {
      traits = JSON.parse(sp.traits);
    } catch {
      traits = undefined;
    }
  }

  const filters: ExploreFilters = {
    collectionSlug: slug,
    status: sp.status as ExploreFilters["status"],
    sort: (sp.sort as ExploreFilters["sort"]) ?? "recent",
    minPrice: sp.minPrice ? Number(sp.minPrice) : undefined,
    maxPrice: sp.maxPrice ? Number(sp.maxPrice) : undefined,
    traits,
    page: 1,
    pageSize: 24,
  };

  const [traitFacets, { items, total, pageCount }] = await Promise.all([
    getCollectionTraitFacets(collection.id),
    getExploreItems(filters),
  ]);

  const queryString = new URLSearchParams({
    collection: slug,
    ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]),
  }).toString();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <LiveRefresh />
      <CollectionHeader collection={collection} />

      <div className="flex flex-col lg:flex-row gap-8 mt-10">
        <FilterSidebar traitFacets={traitFacets} />
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
