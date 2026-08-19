import type { PublicClient } from "viem";

/**
 * Finalises a purchase after the transaction has been submitted.
 *
 * The important property here is that nothing depends on the browser's RPC
 * succeeding. Waiting on a receipt used to gate everything that came after
 * it, so a rate-limited or stalled public RPC would hang forever: the mint
 * had already happened and been paid for on-chain, but the confirm call
 * that records ownership never ran, the phase claim never recorded, and the
 * button sat on "Minting on-chain…" indefinitely. The chain was right and
 * the app was permanently wrong about it.
 *
 * So the receipt wait is now bounded and advisory. Either way the server is
 * asked to verify the transaction itself — it re-fetches the receipt with
 * its own RPC and only trusts what it finds there, so a client that never
 * saw the receipt costs nothing.
 */
export async function settlePurchase({
  publicClient,
  hash,
  chainId,
  saleType,
  onReceipt,
  receiptTimeoutMs = 45_000,
  attempts = 5,
}: {
  publicClient: PublicClient | undefined;
  hash: `0x${string}`;
  chainId: number;
  saleType?: "BUY_NOW" | "BUY_FLOOR" | "NFT_OFFER" | "COLLECTION_OFFER" | "AUCTION";
  /**
   * Fired once the transaction is mined (or the receipt wait gives up),
   * before the server-side sync begins. Callers use this to show success
   * immediately: the buyer owns the NFT the moment the receipt lands, and
   * recording that in our database is bookkeeping they shouldn't have to
   * watch. Waiting for the whole function added the confirm round-trip —
   * and any retry backoff — to what the user experienced as "minting".
   */
  onReceipt?: () => void;
  receiptTimeoutMs?: number;
  attempts?: number;
}): Promise<{ confirmed: boolean }> {
  try {
    await publicClient?.waitForTransactionReceipt({ hash, timeout: receiptTimeoutMs });
  } catch {
    // Timed out or the RPC failed. The transaction is still very likely
    // mined — fall through and let the server be the judge.
  }
  onReceipt?.();

  // The server may legitimately not see the transaction for a few seconds
  // (propagation, or its own RPC lagging), so retry with backoff rather
  // than giving up on the first "not found yet".
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch("/api/purchases/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash, chainId, saleType }),
      });
      if (res.ok) return { confirmed: true };
    } catch {
      // Network blip — keep trying.
    }
    // Don't sleep after the final attempt — nothing follows it, and the
    // caller is often waiting to refresh.
    if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  return { confirmed: false };
}
