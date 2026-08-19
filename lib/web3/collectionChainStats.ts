import { alchemyAvailable, alchemyKey } from "@/lib/web3/alchemy";

/**
 * Collection-wide figures taken from the chain rather than our own tables.
 *
 * Owner counts in particular were never trustworthy: we only know about
 * wallets that acquired something through Durchex, so anyone who received
 * a token by direct transfer — or bought it anywhere else — simply wasn't
 * counted. The contract knows all of them.
 *
 * Enumerating holders is an index question, so it goes to Alchemy (see
 * lib/web3/alchemy.ts for why that sits alongside drpc rather than
 * replacing it). A null return means "no better answer than the stored
 * one", never zero.
 */
const HOSTS: Record<number, string> = {
  1: "https://eth-mainnet.g.alchemy.com",
  11155111: "https://eth-sepolia.g.alchemy.com",
};

// Collection pages are read far more often than holders change, and this
// is the slowest thing on them.
const TTL_MS = 60_000;
const cache = new Map<string, { value: number | null; at: number }>();

export async function getOnChainOwnerCount({
  contractAddress,
  chainId,
}: {
  contractAddress: string;
  chainId: number;
}): Promise<number | null> {
  if (!contractAddress || !alchemyAvailable(chainId)) return null;

  const key = `${chainId}:${contractAddress.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  try {
    const res = await fetch(
      `${HOSTS[chainId]}/nft/v3/${alchemyKey()}/getOwnersForContract?contractAddress=${contractAddress}`,
      { headers: { accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { owners?: string[] };
    // The zero address shows up as a holder on some contracts; it is a
    // burn destination, not an owner.
    const owners = (data.owners ?? []).filter(
      (o) => o.toLowerCase() !== "0x0000000000000000000000000000000000000000"
    );
    const value = owners.length;
    cache.set(key, { value, at: Date.now() });
    return value;
  } catch {
    cache.set(key, { value: null, at: Date.now() });
    return null;
  }
}
