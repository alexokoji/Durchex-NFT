"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Tag } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, usePublicClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { MARKETPLACE_ABI, MARKETPLACE_ADDRESS } from "@/lib/web3/marketplaceAbi";
import { ItemDetailView } from "@/lib/types";

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
  signature: string;
  nft: string;
  tokenId: string;
};

/** Lists every active ERC-1155 resale listing for this item — several
 * holders can each be selling part of their balance at different prices
 * at the same time. */
export function EditionListings({ item }: { item: ItemDetailView }) {
  const router = useRouter();
  const { address, chainId: connectedChainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: item.chainId });

  const [listings, setListings] = useState<ResaleListing[] | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/items/${item.id}/listings`)
      .then((r) => (r.ok ? r.json() : { listings: [] }))
      .then((data) => setListings(data.listings ?? []));
  }, [item.id]);

  if (!listings || listings.length === 0 || !MARKETPLACE_ADDRESS) return null;

  async function buy(listing: ResaleListing) {
    if (!address) {
      openConnectModal?.();
      return;
    }
    const qty = Math.max(1, Math.floor(Number(quantities[listing.id] ?? "1")));
    if (!Number.isFinite(qty) || qty <= 0 || qty > listing.remaining) {
      setError(`Enter a quantity between 1 and ${listing.remaining}`);
      return;
    }
    setError(null);
    setBusyId(listing.id);
    try {
      if (connectedChainId !== item.chainId) {
        await switchChainAsync({ chainId: item.chainId });
      }
      const unitPrice = BigInt(Math.round(listing.pricePerUnitEth * 1e18));
      const hash = await writeContractAsync({
        address: MARKETPLACE_ADDRESS!,
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
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Transaction failed");
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
        {listings.map((l) => (
          <div key={l.id} className="rounded-lg border border-white/10 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-white/85 truncate">{l.seller?.username ?? l.seller?.address ?? "Unknown seller"}</div>
              <div className="text-[11px] text-white/40">
                {l.remaining} of {l.quantity} left · {l.pricePerUnitEth.toFixed(3)} ETH each
              </div>
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
        ))}
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
