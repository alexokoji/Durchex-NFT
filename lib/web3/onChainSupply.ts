import { parseAbi } from "viem";
import { rpcClient } from "@/lib/web3/reconcile";

/**
 * Reads how many units of an ERC-1155 edition actually exist on-chain.
 *
 * Our own `Item.mintedSupply` is only ever as good as the last time a
 * browser told us about a purchase, so it drifts low the moment anyone
 * closes a tab mid-mint — which is why the site kept showing one fewer
 * than OpenSea. The contract's own counter can't drift: it is incremented
 * by the mint itself.
 *
 * So the chain is authoritative wherever it can be reached, and the stored
 * value is the fallback for when it can't. Never the other way round.
 */
const MINTED_ABI = parseAbi(["function minted(uint256) view returns (uint256)"]);

// A short cache: item pages are hit far more often than a mint happens,
// and a per-render RPC call would put a third-party outage directly in the
// path of rendering. Deliberately brief — a stale count for a few seconds
// is fine, a wrong one for minutes is what we are fixing.
const TTL_MS = 20_000;
const cache = new Map<string, { value: number; at: number }>();

export async function readMintedSupply({
  contractAddress,
  chainId,
  tokenId,
}: {
  contractAddress: string;
  chainId: number;
  tokenId: string | number | bigint;
}): Promise<number | null> {
  const key = `${chainId}:${contractAddress.toLowerCase()}:${tokenId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const client = rpcClient(chainId);
  if (!client) return null;
  try {
    const value = await client.readContract({
      address: contractAddress as `0x${string}`,
      abi: MINTED_ABI,
      functionName: "minted",
      args: [BigInt(String(tokenId))],
    });
    const n = Number(value);
    cache.set(key, { value: n, at: Date.now() });
    return n;
  } catch {
    // An RPC hiccup, a contract without the accessor, an unparseable
    // tokenId — all mean "no better answer than the stored one", never
    // "zero minted".
    return null;
  }
}

/**
 * Chain-truth minted count for a batch of 1155 items, keyed by item id.
 *
 * Batched so a collection page costs one round of calls rather than one
 * per item, and failures are per-item: one unreadable token doesn't blank
 * the rest.
 */
export async function readMintedSupplies(
  items: { id: string; contractAddress: string; chainId: number; tokenId: string | null }[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const readable = items.filter((i) => i.tokenId !== null && i.contractAddress);
  const results = await Promise.all(
    readable.map((i) =>
      readMintedSupply({ contractAddress: i.contractAddress, chainId: i.chainId, tokenId: i.tokenId! })
    )
  );
  readable.forEach((item, idx) => {
    const value = results[idx];
    if (value !== null) out.set(item.id, value);
  });
  return out;
}
