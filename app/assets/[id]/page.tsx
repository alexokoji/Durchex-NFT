import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ChevronRight, Eye } from "lucide-react";
import { getItemById, getRelatedItems, getItemOffers, getActivity } from "@/lib/queries";
import { MediaPanel } from "@/components/item/MediaPanel";
import { PricePanel } from "@/components/item/PricePanel";
import { ItemTabs } from "@/components/item/ItemTabs";
import { UserChip } from "@/components/item/UserChip";
import { NFTCard } from "@/components/nft/NFTCard";

// Live marketplace data (price, ownership, offers) — never prerender a stale
// snapshot at build time.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ItemDetailPage({ params }: PageProps) {
  const { id } = await params;
  const item = await getItemById(id);
  if (!item) notFound();

  const [related, offers, { activity }] = await Promise.all([
    getRelatedItems(item.collectionId, item.id),
    getItemOffers(item.id),
    getActivity({ itemId: item.id, pageSize: 20 }),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex items-center gap-1.5 text-sm text-white/40 mb-6">
        <Link href="/explore" className="hover:text-white transition">
          Explore
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href={`/collection/${item.collectionSlug}`} className="hover:text-white transition">
          {item.collectionName}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-white/70 truncate">{item.name}</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-10">
        <div>
          <MediaPanel seedKey={item.id} />
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Link
              href={`/collection/${item.collectionSlug}`}
              className="text-sm font-medium text-purple-300 hover:text-purple-200 transition"
            >
              {item.collectionName}
            </Link>
            {item.collectionVerified && <BadgeCheck className="w-4 h-4 text-purple-400" />}
          </div>
          <h1 className="font-display text-3xl font-semibold text-white mb-4">{item.name}</h1>

          <div className="flex items-center gap-2 text-xs text-white/40 mb-6">
            <Eye className="w-3.5 h-3.5" />
            {item.viewCount.toLocaleString()} views
          </div>

          {item.description && (
            <p className="text-sm text-white/55 leading-relaxed mb-6">{item.description}</p>
          )}

          <div className="flex items-center gap-8 mb-6">
            <UserChip label="Creator" user={item.creator} />
            <UserChip label="Owner" user={item.owner} />
          </div>

          <PricePanel item={item} />
        </div>
      </div>

      <div className="mt-10">
        <ItemTabs item={item} offers={offers} activity={activity} />
      </div>

      {related.length > 0 && (
        <div className="mt-14">
          <h2 className="font-display text-2xl font-semibold text-white mb-6">
            More from {item.collectionName}
          </h2>
          <div className="flex gap-5 overflow-x-auto pb-4 -mx-1 px-1">
            {related.map((r) => (
              <div key={r.id} className="w-56 shrink-0">
                <NFTCard item={r} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
