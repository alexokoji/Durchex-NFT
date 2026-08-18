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
  receiptTimeoutMs = 45_000,
  attempts = 5,
}: {
  publicClient: PublicClient | undefined;
  hash: `0x${string}`;
  chainId: number;
  saleType?: "BUY_NOW" | "BUY_FLOOR" | "NFT_OFFER" | "COLLECTION_OFFER" | "AUCTION";
  receiptTimeoutMs?: number;
  attempts?: number;
}): Promise<{ confirmed: boolean }> {
  try {
    await publicClient?.waitForTransactionReceipt({ hash, timeout: receiptTimeoutMs });
  } catch {
    // Timed out or the RPC failed. The transaction is still very likely
    // mined — fall through and let the server be the judge.
  }

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
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  return { confirmed: false };
}
