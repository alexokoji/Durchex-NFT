"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tag, Loader2 } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, useReadContract, useSignTypedData, usePublicClient} from "wagmi";
import { Button } from "@/components/ui/Button";
import { useTxSuccess } from "@/components/tx/TxSuccess";
import { ERC721_APPROVAL_ABI, marketplaceAddressFor } from "@/lib/web3/marketplaceAbi";
import { buildListing1155TypedData, generateListing1155Nonce } from "@/lib/web3/listing1155";
import { ItemDetailView } from "@/lib/types";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { walletError } from "@/lib/web3/walletError";

/** Lets a holder list part (or all) of their ERC-1155 balance for resale. */
export function ListEditionForm({ item }: { item: ItemDetailView }) {
  const { rate } = useCurrency();
  const router = useRouter();
  const { address, chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: item.chainId });
  const { signTypedDataAsync } = useSignTypedData();

  const marketplaceAddress = marketplaceAddressFor(item.chainId);
  const { celebrate } = useTxSuccess();
  const [balance, setBalance] = useState(0);
  const [mode, setMode] = useState<"fixed" | "auction">("fixed");
  const [quantity, setQuantity] = useState("");
  const [priceEth, setPriceEth] = useState("");
  const [durationHours, setDurationHours] = useState("24");
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
    args: address && marketplaceAddress ? [address, marketplaceAddress] : undefined,
    chainId: item.chainId,
    query: { enabled: !!address && !!marketplaceAddress },
  });

  if (!marketplaceAddress || balance <= 0) return null;

  // Mirrors the server-side gate in PATCH /api/items/[id]: resale opens
  // per item, once every unit of it is on-chain. Showing the form before
  // then just invites the owner to fill it in and be refused.
  if (!item.collectionResaleOpen) {
    return (
      <div className="surface-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-white mb-1">
          <Tag className="w-4 h-4 text-purple-300" /> Resale isn&rsquo;t available yet
        </div>
        <p className="text-xs text-white/45">
          Listing opens once this collection has finished minting.
        </p>
      </div>
    );
  }

  async function submit() {
    const qty = Math.floor(Number(quantity));
    const price = Number(priceEth);
    if (!Number.isFinite(qty) || qty <= 0 || qty > balance) {
      setError(`Enter a quantity between 1 and ${balance}`);
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError(mode === "auction" ? "Enter a valid reserve price" : "Enter a valid per-unit price");
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
        const approvalHash = await writeContractAsync({
          address: item.contractAddress as `0x${string}`,
          abi: ERC721_APPROVAL_ABI,
          functionName: "setApprovalForAll",
          args: [marketplaceAddress!, true],
          chainId: item.chainId,
        });
        // Wait for the receipt rather than a fixed delay: on mainnet an
        // approval rarely mines in two seconds, and continuing early sends
        // the next call before the approval exists, which reverts.
        await publicClient?.waitForTransactionReceipt({ hash: approvalHash });
        await refetchApproval();
      }

      if (mode === "auction") {
        // Nothing to sign yet — the winner and final price aren't known
        // until the auction ends; the seller signs the actual sale then.
        setPhase("saving");
        const nonce = generateListing1155Nonce();
        const res = await fetch(`/api/items/${item.id}/listings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: qty,
            pricePerUnitEth: price,
            isAuction: true,
            auctionEndsAt: new Date(Date.now() + Number(durationHours) * 60 * 60 * 1000).toISOString(),
            nonce: nonce.toString(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to start auction");
      } else {
        setPhase("signing");
        const nonce = generateListing1155Nonce();
        const typedData = buildListing1155TypedData({
          chainId: item.chainId,
          verifyingContract: marketplaceAddress!,
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
      }

      setPhase("idle");
      celebrate({
        action: "list",
        imageUrl: item.imageUrl,
        seedKey: item.id,
        subject: item.name,
        detail: mode === "auction" ? `${qty} up for auction from ${price} ETH` : `${qty} × ${price} ETH`,
        secondary: { label: "View NFT", href: `/assets/${item.id}` },
      });
      setQuantity("");
      setPriceEth("");
      router.refresh();
    } catch (err) {
      setError(walletError(err, "Couldn't list this item"));
      setPhase("idle");
    }
  }

  return (
    <div className="surface-card p-5 mt-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-1">
        <Tag className="w-4 h-4 text-purple-300" /> List some for sale
      </div>
      <p className="text-xs text-white/45 mb-3">You hold {balance}. Choose how many to sell and at what price each.</p>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => setMode("fixed")}
          className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${mode === "fixed" ? "border-purple-500/60 bg-purple-700/15 text-white" : "border-white/10 text-white/50 hover:border-white/20"}`}
        >
          Fixed price
        </button>
        <button
          type="button"
          onClick={() => setMode("auction")}
          className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${mode === "auction" ? "border-purple-500/60 bg-purple-700/15 text-white" : "border-white/10 text-white/50 hover:border-white/20"}`}
        >
          Auction
        </button>
      </div>
      <div className={`grid gap-2 mb-2 ${mode === "auction" ? "grid-cols-3" : "grid-cols-2"}`}>
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
          placeholder={mode === "auction" ? "Reserve price/unit (ETH)" : "Price per unit (ETH)"}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
        />
        {mode === "auction" && (
          <input
            type="number"
            min="1"
            value={durationHours}
            onChange={(e) => setDurationHours(e.target.value)}
            placeholder="Duration (hours)"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
          />
        )}
      </div>

      <UsdHint eth={Number(priceEth)} quantity={Math.max(1, Number(quantity) || 1)} rate={rate} />

      <Button
        onClick={submit}
        disabled={phase !== "idle"}
        icon={phase !== "idle" ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
      >
        {phase === "switching" && "Switch network…"}
        {phase === "approving" && "Approve in wallet…"}
        {phase === "signing" && "Sign listing in wallet…"}
        {phase === "saving" && "Listing…"}
        {phase === "idle" && (mode === "auction" ? "Start auction" : "List for sale")}
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

/**
 * The dollar value of what the seller just typed.
 *
 * The input stays in ETH deliberately — that is the number the signature
 * commits to, and letting someone enter a figure they believe is dollars
 * while signing it as ETH is not a mistake worth risking. This only
 * reports what the ETH amount is worth, so a seller pricing in their head
 * in dollars can check themselves before signing.
 */
function UsdHint({
  eth,
  quantity = 1,
  rate,
}: {
  eth: number;
  quantity?: number;
  rate: number | null;
}) {
  if (!rate || !Number.isFinite(eth) || eth <= 0) return null;
  const each = eth * rate;
  const total = each * quantity;
  const money = (n: number) =>
    n < 0.01 ? "<$0.01" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return (
    <p className="text-[11px] text-white/40 tabular-nums mt-2">
      {quantity > 1 ? `${money(each)} each · ${money(total)} total` : money(each)}
    </p>
  );
}
