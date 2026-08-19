"use client";

import { Layers } from "lucide-react";
import { BuyEditionButton } from "@/components/item/BuyEditionButton";
import { ListEditionForm } from "@/components/item/ListEditionForm";
import { ItemDetailView } from "@/lib/types";

/** ERC-1155 items don't have one owner or one price — this replaces
 * PricePanel's single-listing view with supply progress, the primary
 * (creator) sale if still open, every active resale listing from any
 * holder, and a form for the viewer to list their own balance. */
export function EditionPanel({ item }: { item: ItemDetailView }) {
  const remaining = Math.max(0, item.totalSupply - item.mintedSupply);
  const soldOut = remaining <= 0;

  return (
    <div className="surface-card p-6">
      <div className="flex items-center gap-2 text-[11px] text-white/40 mb-1">
        <Layers className="w-3.5 h-3.5" /> {item.mintedSupply} / {item.totalSupply} minted
      </div>
      <div className="mb-5">
        <div className="text-[11px] text-white/40 mb-1">Price per unit</div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-semibold text-white tabular-nums">{item.priceEth.toFixed(3)}</span>
          <span className="text-purple-300 font-medium">ETH</span>
        </div>
      </div>

      {!soldOut ? (
        <BuyEditionButton item={item} />
      ) : (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
          <p className="text-sm font-medium text-white/60">Primary sale sold out</p>
          <p className="text-xs text-white/35 mt-1">Check the Listings tab for resale.</p>
        </div>
      )}

      {/* Resale listings live in the Listings tab now — stacking every
          seller's row above the form pushed the form itself off screen and
          made the panel read as a list rather than an action. */}
      <ListEditionForm item={item} />
    </div>
  );
}
