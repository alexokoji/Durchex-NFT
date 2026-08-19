import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ChevronRight, Eye } from "lucide-react";
import { getItemById, getRelatedItems, getItemOffers, getActivity, getCollectionSummary } from "@/lib/queries";
import { MediaPanel } from "@/components/item/MediaPanel";
import { PricePanel } from "@/components/item/PricePanel";
import { ItemTabs } from "@/components/item/ItemTabs";
import { ItemStatStrip } from "@/components/item/ItemStatStrip";
import { SellToTopOffer } from "@/components/item/SellToTopOffer";
import { MakeItemOfferButton } from "@/components/item/MakeItemOfferButton";
import { CollectionSummary } from "@/components/item/CollectionSummary";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { UserChip } from "@/components/item/UserChip";
import { NFTCard } from "@/components/nft/NFTCard";
import { ReportButton } from "@/components/moderation/ReportButton";

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

  const [related, offers, { activity }, collectionSummary] = await Promise.all([
    getRelatedItems(item.collectionId, item.id),
    getItemOffers(item.id),
    getActivity({ itemId: item.id, pageSize: 20 }),
    getCollectionSummary(item.collectionId),
  ]);

  // The single best standing offer, so a holder can sell into it without
  // hunting through the Orders tab for the right row.
  const topOffer = offers.find((o) => o.type === "offer" && o.status === "active") ?? null;

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
          <MediaPanel seedKey={item.id} url={item.mediaUrl} type={item.mediaType} alt={item.name} />
        </div>

        <div>
          <h1 className="font-display text-3xl font-semibold text-white mb-2">{item.name}</h1>

          <div className="flex items-center gap-2 mb-3">
            <Link
              href={`/collection/${item.collectionSlug}`}
              className="text-sm text-purple-300 hover:text-purple-200 transition truncate"
            >
              {item.collectionName}
            </Link>
            {item.creatorTier !== "none" ? (
              <VerifiedBadge tier={item.creatorTier} className="w-4 h-4" />
            ) : (
              item.collectionVerified && <BadgeCheck className="w-4 h-4 text-purple-400" />
            )}
          </div>

          {/* The identity line: what it is, where it lives, how many hold
              it. Everything here is verifiable on a block explorer, which
              is why the contract is shown rather than hidden. */}
          <div className="flex flex-wrap items-center gap-1.5 mb-5">
            <Chip>{item.standard}</Chip>
            <Chip>{item.chainId === 1 ? "Ethereum" : `Chain ${item.chainId}`}</Chip>
            {item.ownersCount > 0 && (
              <Chip>
                {item.ownersCount.toLocaleString()} {item.ownersCount === 1 ? "owner" : "owners"}
              </Chip>
            )}
            <span className="flex items-center gap-1 text-xs text-white/30">
              <Eye className="w-3.5 h-3.5" />
              {item.viewCount.toLocaleString()}
            </span>
          </div>

          <div className="mb-5">
            <ItemStatStrip
              item={item}
              topOfferAction={<SellToTopOffer item={item} topOfferId={topOffer?.id ?? null} />}
            />
          </div>

          <PricePanel item={item} />

          <div className="mt-3">
            <MakeItemOfferButton item={item} />
          </div>

          <div className="flex items-center gap-8 mt-6">
            <UserChip label="Creator" user={item.creator} />
            <UserChip label="Owner" user={item.owner} />
          </div>

          {item.description && (
            <p className="text-sm text-white/55 leading-relaxed mt-6">{item.description}</p>
          )}

          {collectionSummary && (
            <div className="mt-6">
              <CollectionSummary summary={collectionSummary} />
            </div>
          )}

          <ReportButton targetId={item.id} />
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

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wide text-white/55">
      {children}
    </span>
  );
}
