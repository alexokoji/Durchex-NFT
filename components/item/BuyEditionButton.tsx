"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2 } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, usePublicClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { MARKETPLACE_ABI, MARKETPLACE_ADDRESS } from "@/lib/web3/marketplaceAbi";
import { ItemDetailView } from "@/lib/types";

/** Buy `quantity` not-yet-minted units of an ERC-1155 edition's primary sale. */
export function BuyEditionButton({ item }: { item: ItemDetailView }) {
  const router = useRouter();
  const { address, chainId: connectedChainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: item.chainId });

  const [quantity, setQuantity] = useState("1");
  const [phase, setPhase] = useState<"idle" | "switching" | "confirm" | "mining" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const voucher = item.editionVoucher;
  const remaining = Math.max(0, item.totalSupply - item.mintedSupply);
  if (!voucher || !MARKETPLACE_ADDRESS || remaining <= 0) return null;

  async function buy() {
    if (!address) {
      openConnectModal?.();
      return;
    }
    const qty = Math.max(1, Math.floor(Number(quantity)));
    if (!Number.isFinite(qty) || qty <= 0 || qty > remaining) {
      setError(`Enter a quantity between 1 and ${remaining}`);
      return;
    }
    setError(null);
    try {
      if (connectedChainId !== item.chainId) {
        setPhase("switching");
        await switchChainAsync({ chainId: item.chainId });
      }

      setPhase("confirm");
      const unitPrice = BigInt(voucher!.minPrice);
      const hash = await writeContractAsync({
        address: MARKETPLACE_ADDRESS!,
        abi: MARKETPLACE_ABI,
        functionName: "buyLazy1155",
        args: [
          item.contractAddress as `0x${string}`,
          BigInt(qty),
          {
            tokenId: BigInt(voucher!.tokenId),
            uri: voucher!.uri,
            minPrice: unitPrice,
            creator: voucher!.creator as `0x${string}`,
            royaltyBps: BigInt(voucher!.royaltyBps),
            maxSupply: BigInt(voucher!.maxSupply),
            nonce: BigInt(voucher!.nonce),
            deadline: BigInt(voucher!.deadline),
          },
          voucher!.signature as `0x${string}`,
        ],
        value: unitPrice * BigInt(qty),
        chainId: item.chainId,
      });

      setPhase("mining");
      await publicClient?.waitForTransactionReceipt({ hash });

      await fetch("/api/purchases/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash, chainId: item.chainId }),
      }).catch(() => {});

      setPhase("done");
      setTimeout(() => router.refresh(), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Transaction failed");
      setPhase("idle");
    }
  }

  if (phase === "done") {
    return (
      <div className="rounded-xl bg-success/10 border border-success/30 p-4 text-center">
        <p className="text-sm font-medium text-success mb-1">Purchased on-chain 🎉</p>
        <p className="text-xs text-white/40">Syncing ownership — refreshing…</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="number"
          min="1"
          max={remaining}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-purple-500/60"
        />
        <Button
          size="lg"
          className="flex-1"
          icon={phase === "idle" ? <Zap className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
          onClick={buy}
          disabled={phase !== "idle"}
        >
          {phase === "switching" && "Switch network in your wallet…"}
          {phase === "confirm" && "Confirm in your wallet…"}
          {phase === "mining" && "Minting on-chain…"}
          {phase === "idle" && `Buy & Mint (${remaining} left)`}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
