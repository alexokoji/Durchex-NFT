"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { MARKETPLACE_ABI, marketplaceAddressFor } from "@/lib/web3/marketplaceAbi";

export type CancelOutcome =
  | { cancelled: true; txHash: string }
  | { cancelled: false; reason: string };

/**
 * Actually revoking a listing, rather than only hiding it.
 *
 * Removing a listing from Durchex clears the signed authorization from the
 * database, which stops the app ever handing it out again. It does not stop
 * the listing being filled: the signature is a bearer credential, and
 * anyone who already read it — a bot watching the API, a buyer with a stale
 * tab — can still pass it to `buyListed` until its deadline. The only thing
 * that makes it unfillable is marking its nonce used on-chain, which is
 * what `cancelListing` does.
 *
 * That costs gas, so it cannot be silently mandatory. The callers here try
 * it first and remove the listing locally either way, then say plainly
 * which of the two happened — a seller who declines the transaction has
 * still delisted on Durchex, and deserves to know the order is technically
 * live rather than being told it is gone.
 */
export function useOnChainCancel() {
  const { chainId: walletChain } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const [cancelling, setCancelling] = useState(false);

  async function cancelOnChain({
    chainId,
    nonce,
    standard,
  }: {
    chainId: number;
    nonce: string | number | null | undefined;
    standard: "ERC721" | "ERC1155";
  }): Promise<CancelOutcome> {
    const marketplace = marketplaceAddressFor(chainId);
    if (!marketplace) return { cancelled: false, reason: "No marketplace is deployed on that network." };
    // A listing signed before nonces were recorded has nothing to cancel by
    // number; it will lapse at its deadline instead.
    if (nonce === null || nonce === undefined || nonce === "" || nonce === "0") {
      return { cancelled: false, reason: "This listing has no on-chain nonce to cancel." };
    }

    setCancelling(true);
    try {
      if (walletChain !== chainId) {
        // The cancel has to land on the chain the listing belongs to, so a
        // wallet pointed elsewhere is asked to move rather than sending a
        // transaction that would revoke nothing.
        await switchChainAsync({ chainId });
      }

      const hash = await writeContractAsync({
        address: marketplace,
        abi: MARKETPLACE_ABI,
        functionName: standard === "ERC1155" ? "cancelListing1155" : "cancelListing",
        args: [BigInt(String(nonce))],
        chainId,
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      return { cancelled: true, txHash: hash };
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      // Rejecting is a deliberate choice, not a failure, and reads badly if
      // reported as an error.
      if (/user rejected|denied|rejected the request/i.test(message)) {
        return { cancelled: false, reason: "You declined the cancellation transaction." };
      }
      // Already-used nonces are the success case arriving late: the listing
      // was filled or cancelled before this ran, so it is unfillable now.
      if (/already used/i.test(message)) {
        return { cancelled: true, txHash: "" };
      }
      return { cancelled: false, reason: message.split("\n")[0] || "The cancellation didn't go through." };
    } finally {
      setCancelling(false);
    }
  }

  return { cancelOnChain, cancelling };
}
