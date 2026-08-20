"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, usePublicClient, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ERC721_APPROVAL_ABI } from "@/lib/web3/marketplaceAbi";
import { OFFERS_ABI, offersAddressFor, wethAddressFor } from "@/lib/web3/offerCriteria";
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

  const offersAddress = offersAddressFor(chainId);
  const weth = wethAddressFor(chainId);

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

      // Canonical WETH reverts with no reason string at all, so a buyer
      // who has spent or unwrapped their balance produces a bare
      // "reverted" that names nothing. Checking their balance and
      // allowance here turns the most common failure into a sentence, and
      // costs the seller nothing.
      const owed = BigInt(o.pricePerItem) * BigInt(1);
      const [buyerBalance, buyerAllowance] = await Promise.all([
        publicClient!.readContract({
          address: weth!,
          abi: WETH_ALLOWANCE_ABI,
          functionName: "balanceOf",
          args: [o.buyer as `0x${string}`],
        }),
        publicClient!.readContract({
          address: weth!,
          abi: WETH_ALLOWANCE_ABI,
          functionName: "allowance",
          args: [o.buyer as `0x${string}`, offersAddress!],
        }),
      ]);
      if ((buyerBalance as bigint) < owed) {
        throw new Error(
          "The buyer no longer holds enough wrapped ETH to cover this offer, so it can't be filled."
        );
      }
      if ((buyerAllowance as bigint) < owed) {
        throw new Error(
          "The buyer hasn't approved enough wrapped ETH for this offer, so it can't be filled."
        );
      }
      // Simulated before signing: a revert here costs nothing and carries
      // the contract's own reason string, where a failed send costs gas
      // and surfaces as a wall of hex.
      const args = [
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
        ] as const;

      await publicClient?.simulateContract({
        address: offersAddress!,
        abi: OFFERS_ABI,
        functionName: "acceptCollectionOffer",
        args,
        account: address as `0x${string}`,
      });

      const hash = await writeContractAsync({
        address: offersAddress!,
        abi: OFFERS_ABI,
        functionName: "acceptCollectionOffer",
        args,
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
      celebrate({
        action: "accept",
        detail: data.offer?.pricePerItemEth ? `${data.offer.pricePerItemEth} ETH` : undefined,
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
function explainAcceptFailure(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const known: [RegExp, string][] = [
    [/cannot fill your own offer/i, "This is your own offer — someone else has to accept it."],
    [/token not eligible/i, "This offer doesn't cover this NFT."],
    [/offer expired/i, "This offer has expired."],
    [/offer cancelled/i, "The buyer withdrew this offer."],
    [/exceeds offer quantity/i, "This offer has already been filled."],
    [/invalid signature/i, "The buyer's signature is no longer valid — ask them to re-make the offer."],
    [
      /transfer amount exceeds (balance|allowance)|insufficient allowance/i,
      "The buyer no longer has enough wrapped ETH to cover this offer.",
    ],
    [/caller is not token owner|insufficient balance for transfer/i, "You no longer hold this NFT."],
    [/not approved|caller is not approved/i, "Approve the offers contract to move this NFT, then try again."],
    [/user rejected|denied/i, "You cancelled the transaction."],
  ];
  for (const [pattern, message] of known) if (pattern.test(raw)) return message;

  // A revert carrying no reason at all is almost always WETH, which uses
  // bare requires — saying "reverted" would leave the seller with nothing.
  if (/reverted\.?[\s]*$/i.test(raw.split("\n")[0] ?? "")) {
    return "The buyer's wrapped ETH is no longer available, so this offer can't be filled.";
  }

  // Unrecognised: show the contract's reason if there is one, never the
  // function-name line.
  const reason = raw.match(/reverted with the following reason:[\s]*(.+)/i)?.[1]?.trim();
  return reason || raw.split("\n")[0] || "Transaction failed";
}

const WETH_ALLOWANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;
