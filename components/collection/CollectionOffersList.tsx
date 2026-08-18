"use client";

import { useEffect, useState } from "react";
import { Tag } from "lucide-react";
import { CountdownTimer } from "@/components/nft/CountdownTimer";
import { useSession } from "@/hooks/useSession";
import { offersAddressFor } from "@/lib/web3/offerCriteria";
import { CollectionDetailView } from "@/lib/types";

type CollectionOfferRow = {
  id: string;
  buyer: { username?: string; address?: string } | null;
  buyerAddress: string;
  pricePerItemEth: number;
  currency: string;
  quantity: number;
  filledQuantity: number;
  remaining: number;
  criteria: { traitType?: string; values?: string[] } | null;
  deadline: string | null;
};

/** Standing collection-wide offers, best price first. Any holder of an
 *  eligible NFT can fill one from that NFT's own page. */
export function CollectionOffersList({ collection }: { collection: CollectionDetailView }) {
  const { user } = useSession();
  const [offers, setOffers] = useState<CollectionOfferRow[] | null>(null);

  useEffect(() => {
    fetch(`/api/collections/${collection.id}/offers`)
      .then((r) => (r.ok ? r.json() : { offers: [] }))
      .then((data) => setOffers(data.offers ?? []));
  }, [collection.id]);

  if (!offersAddressFor(collection.chainId)) return null;
  if (!offers || offers.length === 0) return null;

  return (
    <div className="surface-card p-5 mt-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-1">
        <Tag className="w-4 h-4 text-purple-300" /> Collection offers
      </div>
      <p className="text-xs text-white/45 mb-4">
        Standing bids for any eligible NFT in this collection. If you own one, you can accept from its item page.
      </p>
      <div className="space-y-2">
        {offers.map((o) => {
          const isMine = !!user && user.address.toLowerCase() === o.buyerAddress.toLowerCase();
          return (
            <div
              key={o.id}
              className="rounded-lg border border-white/10 p-3 flex items-center justify-between gap-3 bg-white/[0.02]"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-white tabular-nums">
                    {o.pricePerItemEth.toFixed(3)} {o.currency}
                  </span>
                  <span className="text-[11px] text-white/40">
                    {o.remaining} of {o.quantity} {o.quantity === 1 ? "NFT" : "NFTs"}
                  </span>
                  {isMine && (
                    <span className="text-[10px] rounded-full px-2 py-0.5 border border-purple-500/40 bg-purple-700/15 text-purple-200">
                      Yours
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-white/35 mt-0.5 truncate">
                  by {o.buyer?.username ?? `${o.buyerAddress.slice(0, 8)}…`}
                  {o.criteria?.traitType && ` · ${o.criteria.traitType}: ${o.criteria.values?.join(", ")}`}
                </div>
              </div>
              {o.deadline && (
                <div className="shrink-0">
                  <CountdownTimer endsAt={o.deadline} compact />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
