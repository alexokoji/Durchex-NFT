"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2, ExternalLink } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, usePublicClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { MARKETPLACE_ABI, MARKETPLACE_ADDRESS } from "@/lib/web3/marketplaceAbi";
import { ItemDetailView } from "@/lib/types";

/**
 * The one real on-chain purchase path in the app: calls
 * DurchexMarketplace.buyLazy on a live deployment (see contracts/README.md).
 * Only rendered when the item's collection has a real contractAddress on a
 * chain the app knows about — every other item still shows the "not wired
 * up yet" notice in PricePanel instead of pretending to transact.
 */
export function BuyLazyButton({ item }: { item: ItemDetailView }) {
  const router = useRouter();
  const { address, chainId: connectedChainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: item.chainId });

  const [phase, setPhase] = useState<"idle" | "switching" | "confirm" | "mining" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  if (!item.voucher || !MARKETPLACE_ADDRESS) return null;
  const voucher = item.voucher;

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
        functionName: "buyLazy",
        args: [
          item.contractAddress as `0x${string}`,
          {
            tokenId: BigInt(voucher.tokenId),
            uri: voucher.uri,
            minPrice: BigInt(voucher.minPrice),
            creator: voucher.creator as `0x${string}`,
            royaltyBps: BigInt(voucher.royaltyBps),
            nonce: BigInt(voucher.nonce),
          },
          voucher.signature as `0x${string}`,
        ],
        value: BigInt(voucher.minPrice),
        chainId: item.chainId,
      });
      setTxHash(hash);

      setPhase("mining");
      await publicClient?.waitForTransactionReceipt({ hash });

      setPhase("done");
      // The indexer worker (scripts/indexer.ts) picks up the on-chain event
      // and syncs MongoDB asynchronously — give it a moment before refreshing
      // so this page shows the new owner instead of the stale "Unminted" state.
      setTimeout(() => router.refresh(), 2500);
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
        {phase === "mining" && "Minting on-chain…"}
        {phase === "idle" && "Buy & Mint (on-chain)"}
      </Button>
      {txHash && (
        <a
          href={`#`}
          onClick={(e) => e.preventDefault()}
          className="mt-2 flex items-center gap-1 text-[11px] text-white/40"
        >
          <ExternalLink className="w-3 h-3" />
          tx {txHash.slice(0, 10)}…{txHash.slice(-6)}
        </a>
      )}
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
