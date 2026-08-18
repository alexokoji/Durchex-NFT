"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, usePublicClient, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ERC721_APPROVAL_ABI } from "@/lib/web3/marketplaceAbi";
import { OFFERS_ABI, offersAddressFor } from "@/lib/web3/offerCriteria";

/**
 * Accepts an offer on-chain via DurchexOffers. Works for both per-item NFT
 * offers and collection offers — the two differ only in how wide the
 * eligible set is, so the seller's transaction is identical.
 *
 * `prepareUrl` is the endpoint that validates eligibility and returns the
 * signed offer plus a merkle proof.
 */
export function AcceptOfferButton({
  prepareUrl,
  prepareBody,
  nftContract,
  chainId,
  label = "Accept",
  onDone,
}: {
  prepareUrl: string;
  prepareBody?: Record<string, unknown>;
  nftContract: string;
  chainId: number;
  label?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { address, chainId: connectedChainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId });

  const [phase, setPhase] = useState<"idle" | "preparing" | "approving" | "confirm" | "mining" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const offersAddress = offersAddressFor(chainId);

  // The offers contract must be able to move the seller's NFT.
  const { data: isApproved, refetch: refetchApproval } = useReadContract({
    address: nftContract as `0x${string}`,
    abi: ERC721_APPROVAL_ABI,
    functionName: "isApprovedForAll",
    args: address && offersAddress ? [address, offersAddress] : undefined,
    chainId,
    query: { enabled: !!address && !!offersAddress },
  });

  if (!offersAddress) return null;

  async function accept() {
    if (!address) return openConnectModal?.();
    setError(null);
    try {
      setPhase("preparing");
      const res = await fetch(prepareUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prepareBody ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "This offer can't be accepted");

      if (connectedChainId !== chainId) await switchChainAsync({ chainId });

      if (!isApproved) {
        setPhase("approving");
        await writeContractAsync({
          address: nftContract as `0x${string}`,
          abi: ERC721_APPROVAL_ABI,
          functionName: "setApprovalForAll",
          args: [offersAddress!, true],
          chainId,
        });
        await new Promise((r) => setTimeout(r, 2000));
        await refetchApproval();
      }

      setPhase("confirm");
      const o = data.offer;
      const hash = await writeContractAsync({
        address: offersAddress!,
        abi: OFFERS_ABI,
        functionName: "acceptCollectionOffer",
        args: [
          {
            nft: o.nft as `0x${string}`,
            isERC1155: o.isERC1155,
            criteriaRoot: o.criteriaRoot as `0x${string}`,
            pricePerItem: BigInt(o.pricePerItem),
            quantity: BigInt(o.quantity),
            deadline: BigInt(o.deadline),
            nonce: BigInt(o.nonce),
            buyer: o.buyer as `0x${string}`,
          },
          data.signature as `0x${string}`,
          BigInt(data.tokenId),
          BigInt(1),
          (data.proof ?? []) as `0x${string}`[],
        ],
        chainId,
      });

      setPhase("mining");
      await publicClient?.waitForTransactionReceipt({ hash });

      await fetch("/api/offers/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash, chainId }),
      }).catch(() => {});

      setPhase("done");
      onDone?.();
      setTimeout(() => router.refresh(), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Transaction failed");
      setPhase("idle");
    }
  }

  if (phase === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-success">
        <Check className="w-3.5 h-3.5" /> Sold
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        onClick={accept}
        disabled={phase !== "idle"}
        className="rounded-lg border border-purple-500/50 bg-purple-700/15 px-3 py-1.5 text-xs font-medium text-purple-100 hover:bg-purple-700/25 transition disabled:opacity-60"
      >
        {phase === "idle" && label}
        {phase === "preparing" && "Checking…"}
        {phase === "approving" && "Approve in wallet…"}
        {phase === "confirm" && "Confirm in wallet…"}
        {phase === "mining" && "Selling…"}
      </button>
      {error && <span className="text-[11px] text-danger max-w-[16rem] text-right">{error}</span>}
    </div>
  );
}
