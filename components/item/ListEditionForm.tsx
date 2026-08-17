"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tag, Loader2 } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, useReadContract, useSignTypedData } from "wagmi";
import { Button } from "@/components/ui/Button";
import { ERC721_APPROVAL_ABI, MARKETPLACE_ADDRESS } from "@/lib/web3/marketplaceAbi";
import { buildListing1155TypedData, generateListing1155Nonce } from "@/lib/web3/listing1155";
import { ItemDetailView } from "@/lib/types";

/** Lets a holder list part (or all) of their ERC-1155 balance for resale. */
export function ListEditionForm({ item }: { item: ItemDetailView }) {
  const router = useRouter();
  const { address, chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  const [balance, setBalance] = useState(0);
  const [quantity, setQuantity] = useState("");
  const [priceEth, setPriceEth] = useState("");
  const [phase, setPhase] = useState<"idle" | "switching" | "approving" | "signing" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/items/${item.id}/balance`)
      .then((r) => (r.ok ? r.json() : { quantity: 0 }))
      .then((data) => setBalance(data.quantity ?? 0));
  }, [item.id, address]);

  const { data: isApproved, refetch: refetchApproval } = useReadContract({
    address: item.contractAddress as `0x${string}`,
    abi: ERC721_APPROVAL_ABI,
    functionName: "isApprovedForAll",
    args: address && MARKETPLACE_ADDRESS ? [address, MARKETPLACE_ADDRESS] : undefined,
    chainId: item.chainId,
    query: { enabled: !!address && !!MARKETPLACE_ADDRESS },
  });

  if (!MARKETPLACE_ADDRESS || balance <= 0) return null;

  async function submit() {
    const qty = Math.floor(Number(quantity));
    const price = Number(priceEth);
    if (!Number.isFinite(qty) || qty <= 0 || qty > balance) {
      setError(`Enter a quantity between 1 and ${balance}`);
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError("Enter a valid per-unit price");
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
        await writeContractAsync({
          address: item.contractAddress as `0x${string}`,
          abi: ERC721_APPROVAL_ABI,
          functionName: "setApprovalForAll",
          args: [MARKETPLACE_ADDRESS!, true],
          chainId: item.chainId,
        });
        await new Promise((r) => setTimeout(r, 2000));
        await refetchApproval();
      }

      setPhase("signing");
      const nonce = generateListing1155Nonce();
      const typedData = buildListing1155TypedData({
        chainId: item.chainId,
        verifyingContract: MARKETPLACE_ADDRESS!,
        nft: item.contractAddress,
        tokenId: item.tokenId!,
        seller: address as `0x${string}`,
        quantity: qty,
        pricePerUnitEth: price,
        nonce,
      });
      const signature = await signTypedDataAsync(typedData);

      setPhase("saving");
      const res = await fetch(`/api/items/${item.id}/listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: qty,
          pricePerUnitEth: price,
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
      if (!res.ok) throw new Error(data.error ?? "Failed to list");

      setPhase("idle");
      setQuantity("");
      setPriceEth("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Failed to list");
      setPhase("idle");
    }
  }

  return (
    <div className="surface-card p-5 mt-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-1">
        <Tag className="w-4 h-4 text-purple-300" /> List some for sale
      </div>
      <p className="text-xs text-white/45 mb-3">You hold {balance}. Choose how many to sell and at what price each.</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          type="number"
          min="1"
          max={balance}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder={`Quantity (max ${balance})`}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
        />
        <input
          type="number"
          min="0"
          step="0.001"
          value={priceEth}
          onChange={(e) => setPriceEth(e.target.value)}
          placeholder="Price per unit (ETH)"
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
        />
      </div>
      <Button
        onClick={submit}
        disabled={phase !== "idle"}
        icon={phase !== "idle" ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
      >
        {phase === "switching" && "Switch network…"}
        {phase === "approving" && "Approve in wallet…"}
        {phase === "signing" && "Sign listing in wallet…"}
        {phase === "saving" && "Listing…"}
        {phase === "idle" && "List for sale"}
      </Button>
      {!isApproved && (
        <p className="text-[11px] text-white/35 mt-2">
          First listing needs a one-time on-chain approval so the marketplace can transfer units when they sell.
        </p>
      )}
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
