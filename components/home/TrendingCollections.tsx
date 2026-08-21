import { SectionHeading } from "@/components/home/SectionHeading";
import { CollectionCard } from "@/components/nft/CollectionCard";
import { CollectionView } from "@/lib/types";

export function TrendingCollections({ collections }: { collections: CollectionView[] }) {
  return (
    <section className="max-w-7xl mx-auto px-6 py-14">
      <SectionHeading eyebrow="Hot right now" title="Trending Collections" href="/rankings" />
      <div className="flex gap-5 overflow-x-auto pb-4 px-1 snap-x">
        {collections.map((c, i) => (
          <div key={c.id} className="snap-start">
            <CollectionCard collection={c} rank={i + 1} />
          </div>
        ))}
      </div>
    </section>
  );
}
