"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, usePublicClient, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ERC721_APPROVAL_ABI } from "@/lib/web3/marketplaceAbi";
import { OFFERS_ESCROW_ABI, offersEscrowAddressFor } from "@/lib/web3/offersEscrow";
import { walletError } from "@/lib/web3/walletError";
import { useTxSuccess } from "@/components/tx/TxSuccess";

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
  const { celebrate } = useTxSuccess();

  const [phase, setPhase] = useState<"idle" | "preparing" | "approving" | "confirm" | "mining" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const escrowAddress = offersEscrowAddressFor(chainId);

  // The escrow contract must be able to move the seller's NFT.
  const { data: isApproved, refetch: refetchApproval } = useReadContract({
    address: nftContract as `0x${string}`,
    abi: ERC721_APPROVAL_ABI,
    functionName: "isApprovedForAll",
    args: address && escrowAddress ? [address, escrowAddress] : undefined,
    chainId,
    query: { enabled: !!address && !!escrowAddress },
  });

  if (!escrowAddress) return null;

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
          args: [escrowAddress!, true],
          chainId,
        });
        await new Promise((r) => setTimeout(r, 2000));
        await refetchApproval();
      }

      setPhase("confirm");
      // Escrowed offers settle straight from the contract's own funds, so
      // there is nothing to verify about the buyer's wallet and no
      // signature to pass — just the id, the token and its proof.
      let hash: `0x${string}`;
      if (data.escrowOfferId) {
        const args = [
          BigInt(data.escrowOfferId),
          BigInt(data.tokenId),
          BigInt(1),
          (data.proof ?? []) as `0x${string}`[],
        ] as const;

        await publicClient?.simulateContract({
          address: escrowAddress!,
          abi: OFFERS_ESCROW_ABI,
          functionName: "acceptOffer",
          args,
          account: address as `0x${string}`,
        });

        hash = await writeContractAsync({
          address: escrowAddress!,
          abi: OFFERS_ESCROW_ABI,
          functionName: "acceptOffer",
          args,
          chainId,
        });
      } else {
        // Offers made before ETH escrow were WETH promises against the old
        // contract, and are only fillable if the buyer still holds and has
        // approved the WETH. Rather than run a second settlement path that
        // mostly fails, they are refused with the remedy.
        throw new Error(
          "This offer was made under the old WETH system and can no longer be accepted. Ask the buyer to withdraw it and make a new one."
        );
      }

      setPhase("mining");
      await publicClient?.waitForTransactionReceipt({ hash });

      await fetch("/api/offers/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash, chainId }),
      }).catch(() => {});

      setPhase("done");
      celebrate({
        action: "accept",
        detail: undefined,
        txHash: hash,
        chainId,
        profileHref: address ? `/profile/${address}` : undefined,
      });
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

/**
 * Turns a contract revert into something the seller can act on.
 *
 * The raw message leads with the internal function name and the reason is
 * buried several lines down, so a seller saw only that
 * "acceptCollectionOffer reverted" — which names our implementation rather
 * than telling them what went wrong or what to do about it.
 */
function explainAcceptFailure(err: unknown): string | null {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  // A deliberate cancel is not a failure to report back.
  if (/user rejected|user denied|rejected the request|action_rejected/i.test(raw)) return null;
  const known: [RegExp, string][] = [
    [/cannot fill your own offer/i, "This is your own offer — someone else has to accept it."],
    [/token not eligible/i, "This offer doesn't cover this NFT."],
    [/offer expired/i, "This offer has expired."],
    [/offer cancelled/i, "The buyer withdrew this offer."],
    [/exceeds offer quantity/i, "This offer has already been filled."],
    [/invalid signature/i, "The buyer's signature is no longer valid — ask them to re-make the offer."],
    [/offer underfunded|no such offer/i, "This offer is no longer funded."],
    [/offer withdrawn/i, "The buyer withdrew this offer."],
    [/caller is not token owner|insufficient balance for transfer/i, "You no longer hold this NFT."],
    [/not approved|caller is not approved/i, "Approve the offers contract to move this NFT, then try again."],
  ];
  for (const [pattern, message] of known) if (pattern.test(raw)) return message;

  // Unrecognised: the shared helper strips viem's dump to one line.
  const reason = raw.match(/reverted with the following reason:[\s]*(.+)/i)?.[1]?.trim();
  return reason || raw.split("\n")[0] || "Transaction failed";
}

