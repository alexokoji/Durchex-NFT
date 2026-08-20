"use client";

import { Tag, Zap } from "lucide-react";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { showItemListings } from "@/components/item/ItemTabs";
import { ItemDetailView } from "@/lib/types";

/**
 * What a non-holder sees where a holder sees "list for sale".
 *
 * The panel used to render nothing at all for anyone who didn't hold the
 * token, leaving a gap exactly where the page's main action belongs — and
 * the two things such a visitor can actually do, buy the cheapest listing
 * or make an offer, were further down or in a tab they had to find.
 *
 * Buying sends them to the Listings tab rather than duplicating a buy
 * flow here: the cheapest listing is one of several, and choosing among
 * them is the tab's job. This is the signpost, not a second implementation.
 */
export function BuyItemFloor({ item }: { item: ItemDetailView }) {
  const { format } = useCurrency();
  const floor = item.itemFloorEth;

  return (
    <div className="surface-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-1">
        <Tag className="w-4 h-4 text-purple-300" /> Buy this NFT
      </div>

      {floor && floor > 0 ? (
        <>
          <p className="text-xs text-white/45 mb-4">
            Lowest listing right now. Others may be listed higher — the Listings tab has all of them.
          </p>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="font-display text-3xl font-semibold text-white tabular-nums">
              {format(floor, { decimals: 4 })}
            </span>
          </div>
          <button
            onClick={showItemListings}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-700 hover:bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition"
          >
            <Zap className="w-4 h-4" /> Buy floor
          </button>
        </>
      ) : (
        <p className="text-xs text-white/45">
          Nothing is listed for sale at the moment. Making an offer is how you reach the holders —
          your ETH stays yours until someone accepts.
        </p>
      )}
    </div>
  );
}
