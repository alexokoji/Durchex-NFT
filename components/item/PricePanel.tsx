"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Zap, Gavel, Heart, Share2, ArrowRight } from "lucide-react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { CountdownTimer } from "@/components/nft/CountdownTimer";
import { useFavorite } from "@/hooks/useFavorite";
import { useSession } from "@/hooks/useSession";
import { BuyLazyButton } from "@/components/item/BuyLazyButton";
import { BuyListedButton } from "@/components/item/BuyListedButton";
import { ListForSaleForm } from "@/components/item/ListForSaleForm";
import { MARKETPLACE_ADDRESS } from "@/lib/web3/marketplaceAbi";
import { ItemDetailView } from "@/lib/types";

export function PricePanel({ item }: { item: ItemDetailView }) {
  const router = useRouter();
  const { user } = useSession();
  const { openConnectModal } = useConnectModal();
  const [notice, setNotice] = useState<string | null>(null);
  const [showBidForm, setShowBidForm] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const { favorited, count, toggle } = useFavorite(item.id, item.favoriteCount);
  const isAuction = item.status === "auction";
  const isSold = item.status === "sold";
  const isOwner = !!user && user.address === item.owner?.address;
  const isLiveOnChainBuy = !isAuction && !item.isMinted && !!item.voucher && !!MARKETPLACE_ADDRESS;
  const isLiveResaleBuy =
    !isAuction && item.isMinted && item.status === "fixed_price" && !!item.tokenId && !!MARKETPLACE_ADDRESS;
  // A minted item that isn't currently listed for resale at all — nothing
  // is "not wired up" here, there's just no live listing to buy. Distinct
  // from isLiveResaleBuy being false because the marketplace contract isn't
  // configured, which is a real "not wired up yet" case.
  const notCurrentlyListed = !isAuction && item.isMinted && item.status !== "fixed_price";

  function comingSoon(label: string) {
    setNotice(
      `${label} isn't wired up to the marketplace contract yet — see the roadmap in the spec PDF.`
    );
    setTimeout(() => setNotice(null), 4000);
  }

  function requireAuth(action: () => void) {
    if (!user) {
      openConnectModal?.();
      return;
    }
    action();
  }

  return (
    <div className="surface-card p-6">
      {!item.isMinted && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-700/20 border border-purple-500/30 text-[11px] font-semibold text-purple-200 mb-4">
          ⚡ Unminted — mints on purchase
        </div>
      )}

      {isAuction && item.auctionEndsAt && (
        <div className="mb-4">
          <div className="text-[11px] text-white/40 mb-1.5">Auction ends in</div>
          <CountdownTimer endsAt={item.auctionEndsAt} />
        </div>
      )}

      <div className="mb-5">
        <div className="text-[11px] text-white/40 mb-1">
          {isSold ? "Last sale price" : isAuction ? "Current highest bid" : "Price"}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-semibold text-white tabular-nums">
            {(isAuction ? item.highestBidEth ?? item.priceEth : item.priceEth).toFixed(2)}
          </span>
          <span className="text-purple-300 font-medium">ETH</span>
          <span className="text-white/40 text-sm">
            ≈ ${(item.priceUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {!isSold && !isOwner && (
        <div className="flex flex-col gap-2.5">
          {showBidForm ? (
            <BidOfferForm
              itemId={item.id}
              type="auction_bid"
              minAmount={item.highestBidEth ?? item.priceEth}
              onDone={() => {
                setShowBidForm(false);
                router.refresh();
              }}
              onCancel={() => setShowBidForm(false)}
            />
          ) : showOfferForm ? (
            <BidOfferForm
              itemId={item.id}
              type="offer"
              minAmount={0}
              onDone={() => {
                setShowOfferForm(false);
                router.refresh();
              }}
              onCancel={() => setShowOfferForm(false)}
            />
          ) : (
            <>
              {isLiveOnChainBuy ? (
                <BuyLazyButton item={item} />
              ) : isLiveResaleBuy ? (
                <BuyListedButton item={item} />
              ) : notCurrentlyListed ? (
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
                  <p className="text-sm font-medium text-white/60">Not currently for sale</p>
                  <p className="text-xs text-white/35 mt-1">The owner hasn&rsquo;t listed this item.</p>
                </div>
              ) : (
                <Button
                  size="lg"
                  icon={isAuction ? <Gavel className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                  onClick={() =>
                    isAuction
                      ? requireAuth(() => setShowBidForm(true))
                      : comingSoon(item.isMinted ? "Buy Now" : "Buy & Mint")
                  }
                >
                  {isAuction ? "Place Bid" : item.isMinted ? "Buy Now" : "Buy & Mint"}
                </Button>
              )}
              <div className="flex gap-2.5">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => requireAuth(() => setShowOfferForm(true))}
                >
                  Make Offer
                </Button>
                <Button
                  variant="secondary"
                  onClick={toggle}
                  className={favorited ? "text-pink-purple! border-pink-purple/40!" : ""}
                >
                  <Heart className={clsx("w-4 h-4", favorited && "fill-current")} />
                  {count > 0 && <span className="ml-1 text-xs">{count}</span>}
                </Button>
                <Button variant="secondary" onClick={() => comingSoon("Sharing")}>
                  <Share2 className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {!isSold && isOwner && item.isMinted && (
        <div className="flex flex-col gap-2.5">
          {item.status === "fixed_price" ? (
            <div className="surface-card p-4 flex items-center justify-between">
              <span className="text-sm text-white/70">Listed for {item.priceEth} ETH</span>
              <button
                onClick={async () => {
                  await fetch(`/api/items/${item.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "unlist" }),
                  });
                  router.refresh();
                }}
                className="text-xs font-medium text-white/50 hover:text-white transition"
              >
                Unlist
              </button>
            </div>
          ) : (
            <ListForSaleForm item={item} />
          )}
        </div>
      )}

      {notice && (
        <p className="mt-3 text-xs text-white/45 leading-relaxed border-t border-white/10 pt-3">
          {notice}
        </p>
      )}
    </div>
  );
}

function BidOfferForm({
  itemId,
  type,
  minAmount,
  onDone,
  onCancel,
}: {
  itemId: string;
  type: "auction_bid" | "offer";
  minAmount: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(type === "auction_bid" ? (minAmount + 0.05).toFixed(2) : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const amountEth = Number(amount);
    if (!Number.isFinite(amountEth) || amountEth <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, type, amountEth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      <label className="text-xs font-medium text-white/50 mb-1.5 block">
        {type === "auction_bid" ? `Your bid (min ${(minAmount + 0.01).toFixed(2)} ETH)` : "Your offer (ETH)"}
      </label>
      <div className="flex gap-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/60"
        />
        <Button size="md" onClick={submit} disabled={submitting} icon={<ArrowRight className="w-4 h-4" />}>
          {submitting ? "…" : "Submit"}
        </Button>
        <Button variant="ghost" size="md" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
