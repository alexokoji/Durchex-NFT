import { SectionHeading } from "@/components/home/SectionHeading";
import { NFTCard } from "@/components/nft/NFTCard";
import { ItemView } from "@/lib/types";

export function LiveAuctions({ items }: { items: ItemView[] }) {
  if (items.length === 0) return null;
  return (
    <section className="max-w-7xl mx-auto px-6 py-14">
      <SectionHeading eyebrow="Ending soon" title="Live Auctions" href="/explore?status=auction" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
        {items.map((item) => (
          <NFTCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
