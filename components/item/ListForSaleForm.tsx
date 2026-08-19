"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tag, Loader2 } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, useReadContract, useSignTypedData } from "wagmi";
import { Button } from "@/components/ui/Button";
import { useTxSuccess } from "@/components/tx/TxSuccess";
import { ERC721_APPROVAL_ABI, marketplaceAddressFor } from "@/lib/web3/marketplaceAbi";
import { buildListingTypedData, generateListingNonce } from "@/lib/web3/listing";
import { ItemDetailView } from "@/lib/types";

/**
 * Lists an already-minted, owned item for resale. Two on-chain-adjacent
 * steps: the owner's wallet must approve the marketplace contract to move
 * the token (standard ERC-721 setApprovalForAll — a one-time approval that
 * covers every future listing, not per-listing), then the price/status gets
 * saved via PATCH /api/items/[id]. The actual sale happens later when a
 * buyer calls BuyListedButton.
 */
export function ListForSaleForm({ item }: { item: ItemDetailView }) {
  const router = useRouter();
  const { address, chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const marketplaceAddress = marketplaceAddressFor(item.chainId);
  const { celebrate } = useTxSuccess();
  const [priceEth, setPriceEth] = useState("");
  const [phase, setPhase] = useState<"idle" | "switching" | "approving" | "signing" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  const { data: isApproved, refetch: refetchApproval } = useReadContract({
    address: item.contractAddress as `0x${string}`,
    abi: ERC721_APPROVAL_ABI,
    functionName: "isApprovedForAll",
    args: address && marketplaceAddress ? [address, marketplaceAddress] : undefined,
    chainId: item.chainId,
    query: { enabled: !!address && !!marketplaceAddress },
  });

  if (!marketplaceAddress) return null;

  // Mirrors the server-side gate in PATCH /api/items/[id]: resale opens
  // per item, once every unit of it is on-chain. Showing the form before
  // then just invites the owner to fill it in and be refused.
  if (!item.resaleOpen) {
    return (
      <div className="surface-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-white mb-1">
          <Tag className="w-4 h-4 text-purple-300" /> Resale isn&rsquo;t available yet
        </div>
        <p className="text-xs text-white/45">
          Listing opens automatically once every unit of this item is minted
          {item.totalSupply > 0
            ? ` — ${item.mintedSupply.toLocaleString()}/${item.totalSupply.toLocaleString()} minted so far.`
            : "."}
        </p>
      </div>
    );
  }


  async function submit() {
    const price = Number(priceEth);
    if (!Number.isFinite(price) || price <= 0) {
      setError("Enter a valid price");
      return;
    }
    setError(null);
    try {
      if (connectedChainId !== item.chainId) {
        setPhase("switching");
        await switchChainAsync({ chainId: item.chainId });
      }

      if (!isApproved) {
        setPhase("approving");
        const hash = await writeContractAsync({
          address: item.contractAddress as `0x${string}`,
          abi: ERC721_APPROVAL_ABI,
          functionName: "setApprovalForAll",
          args: [marketplaceAddress!, true],
          chainId: item.chainId,
        });
        // Wait a tick then re-check on-chain state rather than trusting the tx alone.
        await new Promise((r) => setTimeout(r, 2000));
        await refetchApproval();
        void hash;
      }

      setPhase("signing");
      const nonce = generateListingNonce();
      const typedData = buildListingTypedData({
        chainId: item.chainId,
        verifyingContract: marketplaceAddress!,
        nft: item.contractAddress,
        tokenId: item.tokenId!,
        seller: address as `0x${string}`,
        priceEth: price,
        nonce,
      });
      const signature = await signTypedDataAsync(typedData);

      setPhase("saving");
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceEth: price,
          signature,
          listing: {
            nft: typedData.message.nft,
            tokenId: typedData.message.tokenId.toString(),
            seller: typedData.message.seller,
            buyer: typedData.message.buyer,
            price: typedData.message.price.toString(),
            deadline: typedData.message.deadline.toString(),
            nonce: typedData.message.nonce.toString(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to list");

      setPhase("idle");
      // A listing is signed off-chain, so there's no transaction to receipt —
      // the follow-up is the item page itself.
      celebrate({
        action: "list",
        imageUrl: item.imageUrl,
        seedKey: item.id,
        subject: item.name,
        detail: `${price} ETH`,
        secondary: { label: "View NFT", href: `/assets/${item.id}` },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Failed to list");
      setPhase("idle");
    }
  }

  return (
    <div className="surface-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
        <Tag className="w-4 h-4 text-purple-300" /> List for sale
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min="0"
          step="0.001"
          value={priceEth}
          onChange={(e) => setPriceEth(e.target.value)}
          placeholder="Price in ETH"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
        />
        <Button
          onClick={submit}
          disabled={phase !== "idle"}
          icon={phase !== "idle" ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
        >
          {phase === "switching" && "Switch network…"}
          {phase === "approving" && "Approve in wallet…"}
          {phase === "signing" && "Sign listing in wallet…"}
          {phase === "saving" && "Listing…"}
          {phase === "idle" && "List"}
        </Button>
      </div>
      {!isApproved && (
        <p className="text-[11px] text-white/35 mt-2">
          First listing needs a one-time on-chain approval so the marketplace can transfer this item when it sells.
        </p>
      )}
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
