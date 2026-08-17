"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseEther } from "viem";
import { Zap, Loader2 } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, usePublicClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { MARKETPLACE_ABI, MARKETPLACE_ADDRESS } from "@/lib/web3/marketplaceAbi";
import { ItemDetailView } from "@/lib/types";

/** Real on-chain resale purchase: calls DurchexMarketplace.buyListed. */
export function BuyListedButton({ item }: { item: ItemDetailView }) {
  const router = useRouter();
  const { address, chainId: connectedChainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: item.chainId });

  const [phase, setPhase] = useState<"idle" | "switching" | "confirm" | "mining" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!item.tokenId || !item.owner || !MARKETPLACE_ADDRESS) return null;

  async function buy() {
    if (!address) {
      openConnectModal?.();
      return;
    }
    setError(null);
    try {
      if (connectedChainId !== item.chainId) {
        setPhase("switching");
        await switchChainAsync({ chainId: item.chainId });
      }

      setPhase("confirm");
      const hash = await writeContractAsync({
        address: MARKETPLACE_ADDRESS!,
        abi: MARKETPLACE_ABI,
        functionName: "buyListed",
        args: [
          item.contractAddress as `0x${string}`,
          BigInt(item.tokenId!),
          item.owner!.address as `0x${string}`,
          parseEther(item.priceEth.toString()),
        ],
        value: parseEther(item.priceEth.toString()),
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
    <div>
      <Button
        size="lg"
        icon={phase === "idle" ? <Zap className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
        onClick={buy}
        disabled={phase !== "idle"}
      >
        {phase === "switching" && "Switch network in your wallet…"}
        {phase === "confirm" && "Confirm in your wallet…"}
        {phase === "mining" && "Buying on-chain…"}
        {phase === "idle" && "Buy Now (on-chain)"}
      </Button>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
