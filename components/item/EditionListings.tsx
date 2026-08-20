"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Tag, Gavel } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, usePublicClient, useSignTypedData } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { CountdownTimer } from "@/components/nft/CountdownTimer";
import { useSession } from "@/hooks/useSession";
import { onLiveRefresh } from "@/components/providers/LiveRefresh";
import { MARKETPLACE_ABI, marketplaceAddressFor } from "@/lib/web3/marketplaceAbi";
import { buildListing1155TypedData } from "@/lib/web3/listing1155";
import { ItemDetailView } from "@/lib/types";
import { useCurrency } from "@/components/providers/CurrencyProvider";

type ResaleListing = {
  id: string;
  seller: { username?: string; address?: string } | null;
  quantity: number;
  filledQuantity: number;
  remaining: number;
  pricePerUnitEth: number;
  buyer: string | null;
  deadline: string | null;
  nonce: string;
  signature: string | null;
  nft: string;
  tokenId: string;
  status: "active" | "auction";
  isAuction: boolean;
  auctionEndsAt: string | null;
  highestBidEth: number;
  highestBidder: { username?: string; address?: string } | null;
};

/** Every active ERC-1155 resale listing for this item — several holders
 * can each be selling (or auctioning) part of their balance at different
 * prices simultaneously. */
export function EditionListings({ item }: { item: ItemDetailView }) {
  const { format } = useCurrency();
  const router = useRouter();
  const { user } = useSession();
  const { address, chainId: connectedChainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const publicClient = usePublicClient({ chainId: item.chainId });

  const [listings, setListings] = useState<ResaleListing[] | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [bidAmounts, setBidAmounts] = useState<Record<string, string>>({});
  const [cancelling, setCancelling] = useState<string | null>(null);
  // Ticks once a second so "has this auction ended" stays accurate for an
  // open tab without calling Date.now() directly during render.
  const [now, setNow] = useState<number | null>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch(`/api/items/${item.id}/listings`)
      .then((r) => (r.ok ? r.json() : { listings: [] }))
      .then((data) => setListings(data.listings ?? []));
  }
  useEffect(load, [item.id]);
  // Fetched in the browser rather than rendered on the server, so a page
  // refresh alone would leave this list a cycle behind everything around
  // it. It reloads on the same beat instead.
  useEffect(() => onLiveRefresh(load), [item.id]);

  const marketplaceAddress = marketplaceAddressFor(item.chainId);
  if (!listings || listings.length === 0 || !marketplaceAddress) return null;

  async function cancelListing(listingId: string) {
    setCancelling(listingId);
    setError(null);
    try {
      const res = await fetch(`/api/items/${item.id}/listings/${listingId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't withdraw the listing");
      setListings((all) => (all ? all.filter((l) => l.id !== listingId) : all));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't withdraw the listing");
    } finally {
      setCancelling(null);
    }
  }

  async function buy(listing: ResaleListing) {
    if (!address) return openConnectModal?.();
    const qty = Math.max(1, Math.floor(Number(quantities[listing.id] ?? "1")));
    if (!Number.isFinite(qty) || qty <= 0 || qty > listing.remaining) {
      setError(`Enter a quantity between 1 and ${listing.remaining}`);
      return;
    }
    setError(null);
    setBusyId(listing.id);
    try {
      if (connectedChainId !== item.chainId) await switchChainAsync({ chainId: item.chainId });
      const unitPrice = BigInt(Math.round(listing.pricePerUnitEth * 1e18));
      const hash = await writeContractAsync({
        address: marketplaceAddress!,
        abi: MARKETPLACE_ABI,
        functionName: "buyListed1155",
        args: [
          {
            nft: listing.nft as `0x${string}`,
            tokenId: BigInt(listing.tokenId),
            seller: listing.seller?.address as `0x${string}`,
            buyer: (listing.buyer ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
            quantity: BigInt(listing.quantity),
            pricePerUnit: unitPrice,
            deadline: BigInt(listing.deadline ? Math.floor(new Date(listing.deadline).getTime() / 1000) : 0),
            nonce: BigInt(listing.nonce),
          },
          BigInt(qty),
          listing.signature as `0x${string}`,
        ],
        value: unitPrice * BigInt(qty),
        chainId: item.chainId,
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      await fetch("/api/purchases/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash, chainId: item.chainId }),
      }).catch(() => {});
      router.refresh();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Transaction failed");
    } finally {
      setBusyId(null);
    }
  }

  async function placeBid(listing: ResaleListing) {
    if (!address) return openConnectModal?.();
    const amountEth = Number(bidAmounts[listing.id]);
    if (!Number.isFinite(amountEth) || amountEth <= 0) {
      setError("Enter a valid bid amount");
      return;
    }
    setError(null);
    setBusyId(listing.id);
    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, listingId: listing.id, type: "auction_bid", amountEth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to place bid");
      setBidAmounts((b) => ({ ...b, [listing.id]: "" }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place bid");
    } finally {
      setBusyId(null);
    }
  }

  async function settle(listing: ResaleListing) {
    if (!address) return openConnectModal?.();
    setError(null);
    setBusyId(listing.id);
    try {
      if (connectedChainId !== item.chainId) await switchChainAsync({ chainId: item.chainId });
      const pricePerUnitEth = listing.highestBidEth / listing.quantity;
      const typedData = buildListing1155TypedData({
        chainId: item.chainId,
        verifyingContract: marketplaceAddress!,
        nft: listing.nft,
        tokenId: listing.tokenId,
        seller: address as `0x${string}`,
        buyer: listing.highestBidder?.address as `0x${string}`,
        quantity: listing.quantity,
        pricePerUnitEth,
        nonce: BigInt(listing.nonce),
      });
      const signature = await signTypedDataAsync(typedData);
      const res = await fetch(`/api/items/${item.id}/listings/${listing.id}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature,
          listing: {
            nft: typedData.message.nft,
            tokenId: typedData.message.tokenId.toString(),
            seller: typedData.message.seller,
            buyer: typedData.message.buyer,
            quantity: typedData.message.quantity.toString(),
            pricePerUnit: typedData.message.pricePerUnit.toString(),
            deadline: typedData.message.deadline.toString(),
            nonce: typedData.message.nonce.toString(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to settle auction");
      router.refresh();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Failed to settle auction");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="surface-card p-5 mt-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
        <Tag className="w-4 h-4 text-purple-300" /> Resale listings
      </div>
      <div className="space-y-2">
        {/* A listing with nothing left is not an offer to sell — showing it
            gives a buyer a quantity box whose only valid input is a number
            it won't accept. The seller's own row still renders below so
            they can see and cancel it. */}
        {listings.filter((l) => l.remaining > 0 || l.seller?.address?.toLowerCase() === address?.toLowerCase()).map((l) => {
          const isSeller = !!user && user.address.toLowerCase() === l.seller?.address?.toLowerCase();
          const auctionEnded = l.auctionEndsAt && now !== null ? new Date(l.auctionEndsAt).getTime() <= now : false;
          const isWinner = !!user && user.address.toLowerCase() === l.highestBidder?.address?.toLowerCase();

          if (l.status === "auction") {
            return (
              <div key={l.id} className="rounded-lg border border-purple-500/30 bg-purple-700/10 p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm text-white/85">
                      <Gavel className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                      {l.quantity} units · auctioned by {l.seller?.username ?? l.seller?.address ?? "Unknown"}
                    </div>
                    <div className="text-[11px] text-white/40 mt-0.5">
                      {l.highestBidEth > 0
                        ? `Highest bid: ${format(l.highestBidEth)} (${l.highestBidder?.username ?? l.highestBidder?.address ?? "someone"})`
                        : `Reserve: ${format(l.pricePerUnitEth)}/unit · ${format(l.pricePerUnitEth * l.quantity)} total`}
                    </div>
                  </div>
                  {!auctionEnded && l.auctionEndsAt && <CountdownTimer endsAt={l.auctionEndsAt} compact />}
                </div>

                {auctionEnded ? (
                  isSeller && l.highestBidder ? (
                    <Button size="sm" onClick={() => settle(l)} disabled={busyId === l.id} icon={busyId === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}>
                      Settle auction — sign &amp; sell to winner
                    </Button>
                  ) : (
                    <p className="text-xs text-white/40">
                      Auction ended{l.highestBidder ? " — waiting for the seller to settle." : " with no bids."}
                    </p>
                  )
                ) : isSeller ? (
                  <p className="text-xs text-white/40">Your auction — waiting for bids.</p>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={bidAmounts[l.id] ?? ""}
                      onChange={(e) => setBidAmounts((b) => ({ ...b, [l.id]: e.target.value }))}
                      placeholder="Total bid (ETH)"
                      className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder:text-white/30"
                    />
                    <Button size="sm" onClick={() => placeBid(l)} disabled={busyId === l.id} icon={busyId === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}>
                      Bid
                    </Button>
                  </div>
                )}
                {isWinner && !isSeller && auctionEnded && (
                  <p className="text-[11px] text-purple-200 mt-2">
                    You&apos;re winning! Waiting for the seller to settle before you can complete the purchase.
                  </p>
                )}
              </div>
            );
          }

          return (
            <div key={l.id} className="rounded-lg border border-white/10 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm text-white/85">
                  <span className="truncate">
                    {isSeller ? "Your listing" : (l.seller?.username ?? l.seller?.address ?? "Unknown seller")}
                  </span>
                  {isSeller && (
                    <span className="rounded-full border border-purple-400/40 bg-purple-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-purple-200 shrink-0">
                      You
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-white/40">
                  {l.remaining} of {l.quantity} left · {format(l.pricePerUnitEth)} each
                  {l.buyer && ` · reserved for ${l.buyer.slice(0, 6)}…`}
                </div>
                {isSeller && (
                  <button
                    onClick={() => cancelListing(l.id)}
                    disabled={cancelling === l.id}
                    className="mt-1 text-[11px] text-white/45 hover:text-danger transition disabled:opacity-40"
                  >
                    {cancelling === l.id ? "Withdrawing…" : "Withdraw listing"}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  min="1"
                  max={l.remaining}
                  value={quantities[l.id] ?? "1"}
                  onChange={(e) => setQuantities((q) => ({ ...q, [l.id]: e.target.value }))}
                  className="w-14 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white text-center"
                />
                <Button
                  size="sm"
                  onClick={() => buy(l)}
                  disabled={busyId === l.id}
                  icon={busyId === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
                >
                  Buy
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
