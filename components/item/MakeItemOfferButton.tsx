"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decodeEventLog, parseEther } from "viem";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Loader2, Tag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { leafOf } from "@/lib/web3/offerCriteria";
import { OFFERS_ESCROW_ABI, offersEscrowAddressFor } from "@/lib/web3/offersEscrow";
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
 * Paid in native ETH, escrowed by the contract at the moment the offer is
 * made. A holder accepting is the one who submits that transaction, and
 * ETH can only be moved by its owner — so the funds have to already be
 * under the contract's control for the sale to settle without the buyer
 * present. Escrowing also means every standing offer is genuinely funded,
 * which the previous WETH model could not promise.
 */
export function MakeItemOfferButton({ item }: { item: ItemDetailView }) {
  const router = useRouter();
  const { address, chainId: connectedChainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: item.chainId });

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [phase, setPhase] = useState<
    "idle" | "switching" | "confirm" | "mining" | "saving"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const escrowAddress = offersEscrowAddressFor(item.chainId);

  const qty = item.standard === "ERC1155" ? Math.max(1, Math.floor(Number(quantity) || 1)) : 1;
  const total = (Number(amount) || 0) * qty;
  const totalWei = total > 0 ? parseEther(total.toString()) : BigInt(0);



  // Nothing to offer against until the token exists on-chain, and nothing
  // to escrow into until the offers contract is deployed here.
  if (!escrowAddress || !item.isMinted || !item.tokenId) return null;

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

      setPhase("confirm");
      // One token, so the eligible set is a single leaf and the proof at
      // accept time is empty. The server derives the same root from the
      // item's own tokenId, so this can't be widened from the client.
      const criteriaRoot = leafOf(String(item.tokenId));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + EXPIRY_SECONDS);
      const pricePerItem = parseEther(price.toString());

      const hash = await writeContractAsync({
        address: escrowAddress!,
        abi: OFFERS_ESCROW_ABI,
        functionName: "makeOffer",
        args: [
          item.contractAddress as `0x${string}`,
          item.standard === "ERC1155",
          criteriaRoot,
          pricePerItem,
          BigInt(qty),
          deadline,
        ],
        // The offer is funded now, in ETH, rather than promised. This is
        // what makes it acceptable later without the buyer present.
        value: pricePerItem * BigInt(qty),
        chainId: item.chainId,
      });

      setPhase("mining");
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });

      // The id is read back from the contract's own event rather than
      // guessed from a counter, so a race with another offer in the same
      // block can't attach the wrong one.
      const made = receipt.logs
        .map((log) => {
          try {
            return decodeEventLog({ abi: OFFERS_ESCROW_ABI, data: log.data, topics: log.topics });
          } catch {
            return null;
          }
        })
        .find((e) => e?.eventName === "OfferMade");
      const escrowOfferId = (made?.args as { offerId?: bigint } | undefined)?.offerId;
      if (escrowOfferId === undefined) throw new Error("Offer was funded but its id couldn't be read");

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
          escrowOfferId: escrowOfferId.toString(),
          deadline: deadline.toString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Offer was funded but couldn't be recorded");

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
        On this NFT specifically. Your ETH is held by the offers contract until a holder accepts —
        withdraw it whenever you like. The offer expires in 7 days.
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
        <p className="text-[11px] mb-3 tabular-nums text-white/40">
          Total {total} ETH · held in escrow until accepted, withdrawable any time
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {phase === "switching"
                ? "Switching network…"
                : phase === "confirm"
                  ? "Confirm in your wallet…"
                  : phase === "mining"
                    ? "Funding offer…"
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
