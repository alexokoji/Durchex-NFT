"use client";

import { Layers } from "lucide-react";
import { BuyEditionButton } from "@/components/item/BuyEditionButton";
import { ListEditionForm } from "@/components/item/ListEditionForm";
import { BuyItemFloor } from "@/components/item/BuyItemFloor";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { ItemDetailView } from "@/lib/types";

/** ERC-1155 items don't have one owner or one price — this replaces
 * PricePanel's single-listing view with supply progress, the primary
 * (creator) sale if still open, every active resale listing from any
 * holder, and a form for the viewer to list their own balance. */
export function EditionPanel({ item }: { item: ItemDetailView }) {
  const { format } = useCurrency();
  // Read from the chain by the balance route, so a holder whose purchase
  // we failed to record still gets the form.
  const [holds, setHolds] = useState(0);
  const { address } = useAccount();
  useEffect(() => {
    if (!address) return setHolds(0);
    fetch(`/api/items/${item.id}/balance`)
      .then((r) => (r.ok ? r.json() : { quantity: 0 }))
      .then((d) => setHolds(Number(d.quantity ?? 0)))
      .catch(() => setHolds(0));
  }, [item.id, address]);
  const remaining = Math.max(0, item.totalSupply - item.mintedSupply);
  const soldOut = remaining <= 0;

  return (
    <div className="surface-card p-6">
      {/* Everything about the primary sale — how many are minted, the mint
          price, the sold-out notice — describes an event that is over once
          the edition is fully minted. Keeping it on screen makes a
          finished mint look like the main thing on offer, when the only
          live market is resale. The supply is a fact about the token
          rather than about the sale, so it moves to the card and the
          stats strip. */}
      {!soldOut && (
        <>
          <div className="flex items-center gap-2 text-[11px] text-white/40 mb-1">
            <Layers className="w-3.5 h-3.5" /> {item.mintedSupply} / {item.totalSupply} minted
          </div>
          <div className="mb-5">
            <div className="text-[11px] text-white/40 mb-1">Price per unit</div>
            <div className="font-display text-3xl font-semibold text-white tabular-nums">
              {format(item.priceEth, { decimals: 3 })}
            </div>
          </div>

          <BuyEditionButton item={item} />
        </>
      )}

      {/* Resale listings live in the Listings tab now — stacking every
          seller's row above the form pushed the form itself off screen and
          made the panel read as a list rather than an action. */}
      {/* A holder gets the form; everyone else gets the two things they
          can actually do, in the same place rather than as a blank gap. */}
      {holds > 0 ? <ListEditionForm item={item} /> : <BuyItemFloor item={item} />}
    </div>
  );
}
