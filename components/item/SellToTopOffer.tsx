"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { AcceptOfferButton } from "@/components/item/AcceptOfferButton";
import { ItemDetailView } from "@/lib/types";

/**
 * One-click sell into the standing best offer.
 *
 * Accepting was only reachable by opening the Orders tab and finding the
 * right row, which is a lot of navigation for the single most obvious
 * thing a holder wants to do with an offer. This puts it where the offer
 * is already shown.
 *
 * Renders nothing unless the viewer can actually sell — an accept button
 * that fails on click is worse than no button.
 */
export function SellToTopOffer({
  item,
  topOfferId,
  topOfferScope,
}: {
  item: ItemDetailView;
  /** Best standing offer, resolved by the page — which already loads them. */
  topOfferId: string | null;
  topOfferScope: "item" | "collection";
}) {
  const { user } = useSession();
  const [canSell, setCanSell] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (item.standard !== "ERC1155") {
      setCanSell(user.address === item.owner?.address);
      return;
    }
    fetch(`/api/items/${item.id}/balance`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setCanSell(Number(data?.quantity ?? 0) > 0))
      .catch(() => setCanSell(false));
  }, [user, item.id, item.standard, item.owner?.address]);

  if (!topOfferId || !canSell) return null;

  return (
    <div className="mt-1.5">
      <AcceptOfferButton
        prepareUrl={
          topOfferScope === "collection"
            ? `/api/collection-offers/${topOfferId}`
            : `/api/bids/${topOfferId}/accept`
        }
        prepareBody={topOfferScope === "collection" ? { itemId: item.id } : undefined}
        nftContract={item.contractAddress}
        chainId={item.chainId}
        label="Sell now"
      />
    </div>
  );
}
