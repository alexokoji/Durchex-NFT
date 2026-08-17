"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2, ExternalLink, Lock } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, usePublicClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { MARKETPLACE_ABI, MARKETPLACE_ADDRESS } from "@/lib/web3/marketplaceAbi";
import { explorerTxUrl } from "@/lib/web3/explorer";
import { PHASE_LABELS, PhaseKey } from "@/lib/mintPhases";
import { ItemDetailView } from "@/lib/types";

type Gate = { configured: boolean; activePhase: PhaseKey | null; canMint: boolean };

/**
 * The one real on-chain purchase path in the app: calls
 * DurchexMarketplace.buyLazy on a live deployment (see contracts/README.md).
 * Only rendered when the item's collection has a real contractAddress on a
 * chain the app knows about — every other item still shows the "not wired
 * up yet" notice in PricePanel instead of pretending to transact.
 *
 * If the collection has mint phases configured (GTD/FCFS/Public), this also
 * gates the button on whether a phase is currently live and the connected
 * wallet is eligible for it — a collection that's never touched phases
 * mints exactly like before, unrestricted.
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
  const [gate, setGate] = useState<Gate | null>(null);

  useEffect(() => {
    if (!address) {
      const id = setTimeout(() => setGate(null), 0);
      return () => clearTimeout(id);
    }
    fetch(`/api/collections/${item.collectionId}/eligibility`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setGate(data.gate))
      .catch(() => setGate(null));
  }, [address, item.collectionId]);

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

      // No indexer runs continuously in this deployment, so tell the server
      // to re-verify this exact transaction on-chain itself and sync
      // MongoDB — see /api/purchases/confirm. Best-effort: the purchase
      // already succeeded on-chain regardless of whether this call works.
      await fetch("/api/purchases/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash, chainId: item.chainId }),
      }).catch(() => {});

      // Records this mint against the active phase's per-wallet/allocation
      // caps, same off-chain enforcement layer DropMintPanel uses.
      if (gate?.activePhase) {
        await fetch(`/api/collections/${item.collectionId}/phases/${gate.activePhase}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: 1 }),
        }).catch(() => {});
      }

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

  // Only block once we've actually checked (gate !== null) and it's a real
  // no — a wallet that hasn't connected yet, or hasn't loaded gate state,
  // still gets the normal button (clicking it prompts connect as usual).
  if (address && gate && gate.configured && !gate.canMint) {
    const label = gate.activePhase ? PHASE_LABELS[gate.activePhase] : null;
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
        <Lock className="w-4 h-4 text-white/30 mx-auto mb-1.5" />
        <p className="text-sm font-medium text-white/70">
          {label ? `${label} is live, but this wallet isn't eligible` : "No mint phase is open right now"}
        </p>
        <p className="text-xs text-white/40 mt-1">Check back once the next phase opens.</p>
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
          href={explorerTxUrl(item.chainId, txHash) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition"
        >
          <ExternalLink className="w-3 h-3" />
          tx {txHash.slice(0, 10)}…{txHash.slice(-6)}
        </a>
      )}
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
