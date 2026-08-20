"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { Loader2, Undo2 } from "lucide-react";
import { OFFERS_ESCROW_ABI, offersEscrowAddressFor } from "@/lib/web3/offersEscrow";

/**
 * Takes an escrowed offer back, returning the ETH to the buyer.
 *
 * The contract allows this at any time, including after expiry — an offer
 * that can no longer be accepted must never trap the deposit. This is the
 * control that makes escrow acceptable in the first place, so it lives on
 * the offer row itself rather than somewhere a buyer has to go looking.
 */
export function WithdrawOfferButton({
  escrowOfferId,
  chainId,
  onDone,
}: {
  escrowOfferId: string;
  chainId: number;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const escrowAddress = offersEscrowAddressFor(chainId);
  if (!escrowAddress) return null;

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      if (connectedChainId !== chainId) await switchChainAsync({ chainId });
      const hash = await writeContractAsync({
        address: escrowAddress!,
        abi: OFFERS_ESCROW_ABI,
        functionName: "withdrawOffer",
        args: [BigInt(escrowOfferId)],
        chainId,
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      // Told to the server after the refund lands, never before — a
      // cancelled record with the ETH still escrowed would be worse than
      // no record at all.
      await fetch("/api/offers/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash, chainId }),
      }).catch(() => {});
      onDone?.();
      router.refresh();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        /user rejected|denied/i.test(raw)
          ? "You cancelled the transaction."
          : /nothing to withdraw/i.test(raw)
            ? "This offer has already been withdrawn or filled."
            : /not your offer/i.test(raw)
              ? "Only the wallet that made this offer can withdraw it."
              : raw.split("\n")[0] || "Couldn't withdraw the offer"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        onClick={withdraw}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/60 hover:border-danger/40 hover:text-danger transition disabled:opacity-40"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
        {busy ? "Withdrawing…" : "Withdraw"}
      </button>
      {error && <span className="text-[11px] text-danger max-w-48 text-right">{error}</span>}
    </span>
  );
}
