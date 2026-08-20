"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseEther } from "viem";
import {
  useAccount,
  useReadContract,
  useSignTypedData,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Loader2, Tag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  ERC20_ABI,
  WETH_ABI,
  buildCollectionOfferTypedData,
  generateOfferNonce,
  leafOf,
  offersAddressFor,
  wethAddressFor,
} from "@/lib/web3/offerCriteria";
import { ItemDetailView } from "@/lib/types";

const EXPIRY_SECONDS = 7 * 24 * 60 * 60;

/**
 * An offer on this one NFT.
 *
 * Only collection-wide offers existed, so a buyer who wanted a particular
 * token had to bid on everything in the collection and hope. Settlement is
 * the same contract either way — an item offer is a collection offer whose
 * eligible set contains exactly one token, so the merkle root is that
 * token's leaf and the proof is empty. That is also why this signs the
 * same typed data the collection offer does rather than inventing a second
 * shape the accept path would have to learn.
 *
 * Quoted and entered in ETH. Settlement pulls funds from the buyer when
 * the holder accepts, and native ETH cannot be pulled — only its owner can
 * send it, and they are not there at that moment. So the offer is backed
 * by wrapped ETH, and the wrapping happens here as one extra step rather
 * than being the buyer's homework.
 */
export function MakeItemOfferButton({ item }: { item: ItemDetailView }) {
  const router = useRouter();
  const { address, chainId: connectedChainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [phase, setPhase] = useState<
    "idle" | "switching" | "wrapping" | "approving" | "signing" | "saving"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const offersAddress = offersAddressFor(item.chainId);
  const weth = wethAddressFor(item.chainId);

  const qty = item.standard === "ERC1155" ? Math.max(1, Math.floor(Number(quantity) || 1)) : 1;
  const total = (Number(amount) || 0) * qty;
  const totalWei = total > 0 ? parseEther(total.toString()) : BigInt(0);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: weth,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && offersAddress ? [address, offersAddress] : undefined,
    chainId: item.chainId,
    query: { enabled: !!address && !!weth && !!offersAddress },
  });
  const needsApproval = allowance !== undefined && totalWei > 0 && (allowance as bigint) < totalWei;

  // An offer is settled by pulling WETH from the buyer at accept time, so
  // an offer backed by plain ETH is one the holder can never fill — it
  // just reverts on them. Checked here, where it is still the buyer's
  // problem to fix, rather than surfacing as a failed accept for someone
  // else.
  const { data: wethBalance, refetch: refetchWeth } = useReadContract({
    address: weth,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: item.chainId,
    query: { enabled: !!address && !!weth },
  });
  const shortOfWeth =
    wethBalance !== undefined && totalWei > 0 && (wethBalance as bigint) < totalWei;

  // Nothing to offer against until the token exists on-chain, and nothing
  // to settle through until the offers contract is deployed here.
  if (!offersAddress || !weth || !item.isMinted || !item.tokenId) return null;

  const busy = phase !== "idle";

  async function submit() {
    if (!address) return openConnectModal?.();
    const price = Number(amount);
    if (!Number.isFinite(price) || price <= 0) return setError("Enter a valid offer amount");

    setError(null);
    try {
      if (connectedChainId !== item.chainId) {
        setPhase("switching");
        await switchChainAsync({ chainId: item.chainId });
      }

      // Native ETH can't be pulled from a wallet at accept time, so the
      // offer has to be backed by wrapped ETH. Wrapping the shortfall here
      // means the buyer offers in ETH and never has to know that.
      if (shortOfWeth) {
        setPhase("wrapping");
        const shortfall = totalWei - ((wethBalance as bigint) ?? BigInt(0));
        await writeContractAsync({
          address: weth!,
          abi: WETH_ABI,
          functionName: "deposit",
          args: [],
          value: shortfall,
          chainId: item.chainId,
        });
        await new Promise((r) => setTimeout(r, 2000));
        await refetchWeth();
      }

      if (needsApproval) {
        setPhase("approving");
        await writeContractAsync({
          address: weth!,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [offersAddress!, totalWei],
          chainId: item.chainId,
        });
        await new Promise((r) => setTimeout(r, 2000));
        await refetchAllowance();
      }

      setPhase("signing");
      // One token, so the eligible set is a single leaf. The server derives
      // the same value from the item's own tokenId and rejects anything
      // else, so this can't be widened from the client.
      const criteriaRoot = leafOf(String(item.tokenId));
      const nonce = generateOfferNonce();
      const typedData = buildCollectionOfferTypedData({
        chainId: item.chainId,
        verifyingContract: offersAddress!,
        nft: item.contractAddress,
        isERC1155: item.standard === "ERC1155",
        criteriaRoot,
        pricePerItemEth: price,
        quantity: qty,
        deadlineSeconds: EXPIRY_SECONDS,
        nonce,
        buyer: address as `0x${string}`,
      });
      const signature = await signTypedDataAsync(typedData);

      setPhase("saving");
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          type: "offer",
          amountEth: price,
          quantity: qty,
          criteriaRoot,
          nonce: nonce.toString(),
          deadline: typedData.message.deadline.toString(),
          signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't place the offer");

      setPhase("idle");
      setOpen(false);
      setAmount("");
      router.refresh();
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Couldn't place the offer");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:border-purple-500/40 transition"
      >
        <Tag className="w-4 h-4 text-purple-300" /> Make offer
      </button>
    );
  }

  return (
    <div className="surface-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-1">
        <Tag className="w-4 h-4 text-purple-300" /> Make an offer
      </div>
      <p className="text-xs text-white/45 mb-4">
        On this NFT specifically. Your ETH stays in your wallet until the holder accepts, and the
        offer expires in 7 days if nobody takes it.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        {item.standard === "ERC1155" && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/40 block mb-1">Units</label>
            <input
              type="number"
              min="1"
              value={quantity}
              disabled={busy}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
        )}
        <div className="flex-1 min-w-40">
          <label className="text-[10px] uppercase tracking-wide text-white/40 block mb-1">
            {item.standard === "ERC1155" ? "Offer per unit (ETH)" : "Offer (ETH)"}
          </label>
          <input
            type="number"
            min="0"
            step="0.0001"
            value={amount}
            disabled={busy}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.05"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>
      </div>

      {total > 0 && (
        <p
          className="text-[11px] mb-3 tabular-nums text-white/40"
        >
          Total {total} ETH
          {shortOfWeth ? " · one extra step to wrap your ETH" : ""}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {phase === "switching"
                ? "Switching network…"
                : phase === "wrapping"
                  ? "Wrapping ETH…"
                  : phase === "approving"
                  ? "Approving WETH…"
                  : phase === "signing"
                    ? "Sign in your wallet…"
                    : "Saving…"}
            </>
          ) : (
            "Place offer"
          )}
        </Button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:bg-white/5 transition"
        >
          Cancel
        </button>
      </div>

      {error && <p className="text-xs text-danger mt-3">{error}</p>}
    </div>
  );
}
