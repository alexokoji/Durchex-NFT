"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap, Loader2, X, AlertTriangle } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, usePublicClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { useTxSuccess } from "@/components/tx/TxSuccess";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { BuyLazyButton } from "@/components/item/BuyLazyButton";
import { BuyListedButton } from "@/components/item/BuyListedButton";
import { BuyEditionButton } from "@/components/item/BuyEditionButton";
import { MARKETPLACE_ABI, marketplaceAddressFor } from "@/lib/web3/marketplaceAbi";
import { CollectionDetailView, ItemDetailView } from "@/lib/types";

// Only resale shapes reach here. A mint is not a floor — see
// lib/floorValidity.ts — so the primary kinds this once handled can no
// longer be returned, and keeping branches for them would quietly
// reintroduce "Buy Floor" opening onto a mint.
type FloorKind = "resale_721" | "resale_1155";
type Listing1155Payload = {
  nft: string;
  tokenId: string;
  seller: string;
  buyer: string | null;
  quantity: string;
  pricePerUnit: string;
  deadline: string;
  nonce: string;
  signature: string;
};
type Floor = {
  kind: FloorKind;
  pricePerUnitEth: number;
  availableQuantity: number;
  listingId: string | null;
  listing1155: Listing1155Payload | null;
  item: ItemDetailView;
};

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Buys the cheapest currently-valid listing in a collection.
 *
 * The cached collection floor is never used to transact — clicking this
 * resolves the actual lowest listing server-side, shows the buyer exactly
 * which NFT and price they're committing to, and binds the purchase to
 * that specific listing. If someone else takes it first the on-chain call
 * reverts; the buyer is never silently rolled onto a pricier NFT.
 */
export function BuyFloorButton({ collection }: { collection: CollectionDetailView }) {
  const router = useRouter();
  const { address, chainId: connectedChainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const { celebrate } = useTxSuccess();
  const [open, setOpen] = useState(false);
  const [floor, setFloor] = useState<Floor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState<{ from: number; to: number } | null>(null);

  const publicClient = usePublicClient({ chainId: floor?.item.chainId ?? collection.chainId });

  async function fetchFloor(): Promise<Floor | null> {
    const res = await fetch(`/api/collections/${collection.id}/floor`, { cache: "no-store" });
    if (!res.ok) throw new Error("Couldn't load the current floor listing");
    const data = await res.json();
    return data.floor ?? null;
  }

  async function openModal() {
    setLoading(true);
    setError(null);
    setChanged(null);
    try {
      const f = await fetchFloor();
      if (!f) {
        setError("Nothing is listed for sale in this collection right now.");
        setFloor(null);
      } else {
        setFloor(f);
      }
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the floor listing");
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Re-resolves the floor immediately before committing. If it moved, the
   * purchase is stopped and the buyer is shown the new price to approve or
   * decline — never charged more than what they agreed to.
   */
  async function revalidate(): Promise<Floor | null> {
    const fresh = await fetchFloor();
    if (!fresh) {
      setError("That listing was just bought and nothing else is listed.");
      setFloor(null);
      return null;
    }
    const authorized = floor?.pricePerUnitEth ?? 0;
    const sameListing =
      fresh.item.id === floor?.item.id && fresh.listingId === floor?.listingId;
    if (!sameListing || fresh.pricePerUnitEth > authorized) {
      setChanged({ from: authorized, to: fresh.pricePerUnitEth });
      setFloor(fresh);
      return null;
    }
    return fresh;
  }

  // ERC-1155 resale is the one shape with no existing single-item button —
  // it fills a specific signed Listing1155 rather than the item's own listing.
  async function buyResale1155() {
    if (!address) return openConnectModal?.();
    if (!floor?.listing1155) return;
    setError(null);
    setLoading(true);
    try {
      const confirmed = await revalidate();
      if (!confirmed?.listing1155) return;

      const chainId = confirmed.item.chainId;
      const marketplace = marketplaceAddressFor(chainId);
      if (!marketplace) throw new Error("Marketplace isn't configured for this chain");
      if (connectedChainId !== chainId) await switchChainAsync({ chainId });

      const l = confirmed.listing1155;
      const unitPrice = BigInt(l.pricePerUnit);
      const hash = await writeContractAsync({
        address: marketplace,
        abi: MARKETPLACE_ABI,
        functionName: "buyListed1155",
        args: [
          {
            nft: l.nft as `0x${string}`,
            tokenId: BigInt(l.tokenId),
            seller: l.seller as `0x${string}`,
            buyer: (l.buyer ?? ZERO) as `0x${string}`,
            quantity: BigInt(l.quantity),
            pricePerUnit: unitPrice,
            deadline: BigInt(l.deadline),
            nonce: BigInt(l.nonce),
          },
          BigInt(1),
          l.signature as `0x${string}`,
        ],
        value: unitPrice,
        chainId,
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      await fetch("/api/purchases/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash, chainId, saleType: "BUY_FLOOR" }),
      }).catch(() => {});
      setOpen(false);
      celebrate({
        action: "buy",
        imageUrl: confirmed.item.imageUrl,
        seedKey: confirmed.item.id,
        subject: confirmed.item.name,
        detail: `${confirmed.pricePerUnitEth} ETH`,
        txHash: hash,
        chainId,
        profileHref: address ? `/profile/${address}` : undefined,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  const price = floor?.pricePerUnitEth ?? 0;
  const royaltyEth = (price * (collection.royaltyBps ?? 0)) / 10000;

  return (
    <>
      <Button
        onClick={openModal}
        disabled={loading}
        icon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
      >
        Buy Floor
      </Button>

      {open && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          onClick={() => setOpen(false)}
        >
          <div className="surface-card p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="font-display text-xl font-semibold text-white">Buy Floor</h2>
              <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            {changed && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-400/10 border border-amber-300/25 p-3 text-xs text-amber-100">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  The floor changed before your purchase went through — it was{" "}
                  <strong>{changed.from.toFixed(3)} ETH</strong>, now{" "}
                  <strong>{changed.to.toFixed(3)} ETH</strong>. Nothing was bought. Review the new
                  listing below and confirm again if you still want it.
                </span>
              </div>
            )}

            {!floor ? (
              <p className="text-sm text-white/50">{error ?? "Nothing is listed in this collection right now."}</p>
            ) : (
              <>
                <p className="text-xs text-white/45 mb-3">You are buying this specific NFT:</p>
                <div className="flex gap-3 mb-4">
                  <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-black">
                    {floor.item.imageUrl ? (
                      <img src={floor.item.imageUrl} alt={floor.item.name} className="w-full h-full object-cover" />
                    ) : (
                      <GeneratedArt seedKey={floor.item.id} className="w-full h-full" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/assets/${floor.item.id}`}
                      className="font-semibold text-white hover:text-purple-300 transition block truncate"
                    >
                      {floor.item.name}
                    </Link>
                    <div className="text-[11px] text-white/40 mt-0.5">
                      {floor.kind === "resale_721" && `Seller ${floor.item.owner?.address?.slice(0, 8) ?? "unknown"}…`}
                      {floor.kind === "resale_1155" &&
                        `Edition resale · ${floor.availableQuantity} available · buying 1`}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 mb-4 space-y-1.5 text-xs">
                  <Row label="Price" value={`${price.toFixed(3)} ETH`} strong />
                  <div className="pt-1.5 mt-1.5 border-t border-white/10 text-white/35">
                    Of what you pay, roughly {royaltyEth.toFixed(4)} ETH goes to the creator as royalty
                    ({((collection.royaltyBps ?? 0) / 100).toFixed(1)}%) and a platform fee is taken; the
                    seller receives the rest. You pay exactly the price above — fees are not added on top.
                  </div>
                </div>

                {error && <p className="text-xs text-danger mb-3">{error}</p>}

                {floor.kind === "resale_721" && <BuyListedButton item={floor.item} />}
                {floor.kind === "resale_1155" && (
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={buyResale1155}
                    disabled={loading}
                    icon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  >
                    Confirm Purchase
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/45">{label}</span>
      <span className={strong ? "text-white font-semibold tabular-nums" : "text-white/70 tabular-nums"}>{value}</span>
    </div>
  );
}
