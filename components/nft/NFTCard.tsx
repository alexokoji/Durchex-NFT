"use client";

import Link from "next/link";
import clsx from "clsx";
import { Heart, Zap, BadgeCheck, Gavel } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { CountdownTimer } from "@/components/nft/CountdownTimer";
import { useFavorite } from "@/hooks/useFavorite";
import { ItemView } from "@/lib/types";

export function NFTCard({ item }: { item: ItemView }) {
  const { format } = useCurrency();
  const isAuction = item.status === "auction";
  const isListed = isAuction || item.status === "fixed_price";
  const hasSaleHistory = !isListed && item.lastSalePriceEth != null;
  const { favorited, count, toggle } = useFavorite(item.id, item.favoriteCount);

  return (
    <Link
      href={`/assets/${item.id}`}
      // Grids of these can run into the hundreds; prefetching every card
      // that scrolls into view wastes bandwidth on pages the visitor never
      // opens and is exactly what Next.js's own prefetching guide flags for
      // "large list of links" — hover still opts a specific card back in.
      prefetch={false}
      className="group surface-card surface-card-hover block overflow-hidden relative"
      style={{ perspective: "1000px" }}
    >
      <div className="relative aspect-square overflow-hidden rounded-t-2xl">
        {item.mediaUrl && !item.mediaType?.startsWith("audio/") ? item.mediaType?.startsWith("video/") ? <video src={item.mediaUrl} muted playsInline preload="metadata" className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110" /> : <img src={item.mediaUrl} alt={item.name} className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110" /> : <GeneratedArt seedKey={item.id} className="w-full h-full transition-transform duration-500 ease-out group-hover:scale-110" />}

        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
          {item.isMinted ? (
            <span className="px-2 py-1 rounded-md bg-black/55 backdrop-blur text-[10px] font-semibold text-white/70 border border-white/15">
              On-chain
            </span>
          ) : (
            <span className="px-2 py-1 rounded-md bg-black/55 backdrop-blur text-[10px] font-semibold text-purple-200 border border-purple-400/30">
              ⚡ Unminted
            </span>
          )}
          {isAuction && (
            <span className="px-2 py-1 rounded-md bg-purple-700/80 backdrop-blur text-[10px] font-semibold text-white flex items-center gap-1 border border-purple-400/40">
              <Gavel className="w-3 h-3" /> Live Auction
            </span>
          )}
        </div>

        <button
          className={clsx(
            "absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/45 backdrop-blur flex items-center justify-center transition hover:bg-black/65",
            favorited ? "text-pink-purple" : "text-white/80 hover:text-pink-purple"
          )}
          aria-label="Favorite"
          onClick={(e) => {
            e.preventDefault();
            toggle();
          }}
        >
          <Heart className={clsx("w-4 h-4", favorited && "fill-current")} />
        </button>

        <div className="absolute inset-x-0 bottom-0 p-2.5 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          {/* Not an inline purchase — a real buy needs the wallet-signed
              voucher/contract/chain data this lightweight card view doesn't
              carry, so this takes you to the item page where the real
              Buy & Mint / Buy Now button lives. Plain <span>, not a nested
              <button>, since the card itself is already the clickable <Link>. */}
          <span className="w-full py-2 rounded-lg bg-white text-void text-xs font-bold shadow-lg group-hover:bg-purple-100 transition flex items-center justify-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            {item.isMinted ? "Quick Buy" : "Buy & Mint"}
          </span>
        </div>
      </div>

      <div className="p-3.5">
        <div className="flex items-center gap-1 text-[11px] text-white/50 mb-1">
          <span className="truncate">{item.collectionName}</span>
          {item.creatorTier !== "none" ? (
            <VerifiedBadge tier={item.creatorTier} className="w-3.5 h-3.5" />
          ) : (
            item.collectionVerified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          )}
        </div>
        <h3 className="text-sm font-semibold text-white truncate mb-2">{item.name}</h3>

        {isAuction && item.auctionEndsAt && (
          <div className="mb-2">
            <CountdownTimer endsAt={item.auctionEndsAt} compact />
          </div>
        )}

        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] text-white/40 mb-0.5">
              {/* What you could pay now beats what someone else paid
                  before: the floor is the decision in front of a browser,
                  last sale is history. It only falls back to history when
                  there is nothing to buy. */}
              {isAuction
                ? "Highest bid"
                : isListed
                  ? "Price"
                  : item.floorEth
                    ? "Floor"
                    : hasSaleHistory
                      ? "Last sale"
                      : "Not listed"}
            </div>
            {isListed || item.floorEth || hasSaleHistory ? (
              <div className="text-sm font-bold text-white tabular-nums">
                {format(
                  isAuction
                    ? item.highestBidEth ?? item.priceEth
                    : isListed
                      ? item.priceEth
                      : (item.floorEth ?? item.lastSalePriceEth)
                )}
              </div>
            ) : (
              <div className="text-sm font-bold text-white/30">—</div>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-white/40">
            <Heart className={clsx("w-3 h-3", favorited && "fill-current text-pink-purple")} />
            {count}
          </div>
        </div>
      </div>
    </Link>
  );
}
