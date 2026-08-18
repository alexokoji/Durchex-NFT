"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2 } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, usePublicClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { useTxSuccess } from "@/components/tx/TxSuccess";
import { MARKETPLACE_ABI, marketplaceAddressFor } from "@/lib/web3/marketplaceAbi";
import { PHASE_LABELS, PhaseKey } from "@/lib/mintPhases";
import { ItemDetailView } from "@/lib/types";

type Gate = { configured: boolean; eligiblePhases: PhaseKey[]; canMint: boolean };

/**
 * Buy `quantity` not-yet-minted units of an ERC-1155 edition's primary sale.
 *
 * Mint phases apply here exactly as they do to ERC-721, with one
 * difference that matters: allocations and wallet caps count *units*, not
 * items, since one purchase can take several editions at once.
 */
export function BuyEditionButton({ item, phase: forcedPhase }: { item: ItemDetailView; phase?: PhaseKey }) {
  const router = useRouter();
  const { address, chainId: connectedChainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: item.chainId });
  const { celebrate } = useTxSuccess();

  const [quantity, setQuantity] = useState("1");
  const [phase, setPhase] = useState<"idle" | "switching" | "confirm" | "mining" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  // Same arrangement as BuyLazyButton: MintPanel supplies the phase when it
  // wraps this button, otherwise the button chooses one itself.
  const [ownPhase, setOwnPhase] = useState<PhaseKey | null>(null);
  const selectedMintPhase = forcedPhase ?? ownPhase;
  const setSelectedMintPhase = setOwnPhase;
  // Per-phase wallet allowance still left, so the quantity input can be
  // capped rather than letting the buyer submit a request the claim
  // endpoint will only reject after they've paid gas.
  const [remainingByPhase, setRemainingByPhase] = useState<Record<string, number | null>>({});

  useEffect(() => {
    if (!address) return;
    fetch(`/api/collections/${item.collectionId}/eligibility`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.gate) return;
        setGate(data.gate);
        setSelectedMintPhase((current) => current ?? data.gate.eligiblePhases[0] ?? null);
        setRemainingByPhase(
          Object.fromEntries(
            (["whitelist", "og", "public"] as PhaseKey[]).map((k) => [k, data[k]?.remaining ?? null])
          )
        );
      })
      .catch(() => setGate(null));
  }, [address, item.collectionId]);

  const voucher = item.editionVoucher;
  const remaining = Math.max(0, item.totalSupply - item.mintedSupply);
  const marketplaceAddress = marketplaceAddressFor(item.chainId);
  if (!voucher || !marketplaceAddress || remaining <= 0) return null;

  async function buy() {
    if (!address) {
      openConnectModal?.();
      return;
    }
    const qty = Math.max(1, Math.floor(Number(quantity)));
    if (!Number.isFinite(qty) || qty <= 0 || qty > maxQty) {
      setError(`Enter a quantity between 1 and ${maxQty}`);
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
        address: marketplaceAddress!,
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

      // Record the claim against whichever phase this wallet minted
      // through, in units — that's what allocation and wallet caps count.
      if (selectedMintPhase) {
        await fetch(`/api/collections/${item.collectionId}/phases/${selectedMintPhase}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: qty }),
        }).catch(() => {});
      }

      setPhase("done");
      celebrate({
        action: "mint",
        imageUrl: item.imageUrl,
        seedKey: item.id,
        subject: item.name,
        detail: `${qty} × ${item.priceEth} ETH`,
        txHash: hash,
        chainId: item.chainId,
        profileHref: address ? `/profile/${address}` : undefined,
      });
      setTimeout(() => router.refresh(), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Transaction failed");
      setPhase("idle");
    }
  }

  if (phase === "done") {
    return (
      <div className="rounded-xl bg-success/10 border border-success/30 p-4 text-center">
        <p className="text-sm font-medium text-success mb-1">Purchased on-chain</p>
        <p className="text-xs text-white/40">Syncing ownership — refreshing…</p>
      </div>
    );
  }

  // Only block once eligibility has actually been checked and came back a
  // real no — an unconnected wallet, or one still loading, shouldn't see
  // a rejection.
  if (address && gate && gate.configured && !gate.canMint) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
        <p className="text-sm font-medium text-white/60">Not eligible right now</p>
        <p className="text-xs text-white/35 mt-1">
          No mint phase this wallet can mint through is open at the moment.
        </p>
      </div>
    );
  }

  // Suppressed when MintPanel wraps this button — it renders its own picker,
  // and two would disagree.
  const showPhasePicker = !forcedPhase && address && gate?.configured && gate.eligiblePhases.length > 1;

  // A wallet can never take more than the smaller of what's left in the
  // edition and what its phase allowance still permits.
  const phaseAllowance = selectedMintPhase ? remainingByPhase[selectedMintPhase] : null;
  const maxQty = phaseAllowance != null ? Math.min(remaining, phaseAllowance) : remaining;

  return (
    <div className="space-y-2">
      {showPhasePicker && (
        <div>
          <div className="text-[11px] text-white/40 mb-1.5">You&rsquo;re eligible for more than one phase — pick one:</div>
          <div className="flex flex-wrap gap-1.5">
            {gate!.eligiblePhases.map((key) => (
              <button
                key={key}
                onClick={() => setSelectedMintPhase(key)}
                className={clsx(
                  "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition",
                  selectedMintPhase === key
                    ? "border-purple-400 bg-purple-500/15 text-purple-100"
                    : "border-white/10 text-white/50 hover:border-white/25"
                )}
              >
                {PHASE_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="number"
          min="1"
          max={maxQty}
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
      {phaseAllowance != null && phaseAllowance < remaining && (
        <p className="text-[11px] text-white/40">
          Your wallet can mint {phaseAllowance} more unit{phaseAllowance === 1 ? "" : "s"} in the{" "}
          {selectedMintPhase ? PHASE_LABELS[selectedMintPhase] : "current"} phase.
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
