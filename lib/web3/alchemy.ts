/**
 * Alchemy's indexed NFT APIs.
 *
 * This sits alongside drpc rather than replacing it. drpc remains the
 * JSON-RPC transport for everything that is a plain chain read —
 * eth_call, eth_getLogs, receipts (see lib/web3/reconcile.ts). Alchemy is
 * used only for the two questions raw RPC genuinely cannot answer at any
 * sensible cost:
 *
 *   - "what NFTs does this wallet own?" — there is no such call; answering
 *     it from RPC means scanning every Transfer ever emitted by every
 *     contract.
 *   - "what is this token's full transfer history?" — possible via logs,
 *     but only by walking the whole chain a thousand blocks at a time.
 *
 * Both need an index, so both go to Alchemy. Everything else stays on
 * drpc, and if the key is missing the features degrade to empty rather
 * than taking the rest of the site with them.
 */
const NFT_HOSTS: Record<number, string> = {
  1: "https://eth-mainnet.g.alchemy.com",
  11155111: "https://eth-sepolia.g.alchemy.com",
};

export function alchemyKey(): string | null {
  return process.env.ALCHEMY_API_KEY || null;
}

export function alchemyAvailable(chainId: number): boolean {
  return !!alchemyKey() && !!NFT_HOSTS[chainId];
}

function nftBase(chainId: number) {
  const key = alchemyKey();
  const host = NFT_HOSTS[chainId];
  if (!key || !host) return null;
  return `${host}/nft/v3/${key}`;
}

function rpcBase(chainId: number) {
  const key = alchemyKey();
  const host = NFT_HOSTS[chainId];
  if (!key || !host) return null;
  return `${host}/v2/${key}`;
}

export type WalletNft = {
  contractAddress: string;
  tokenId: string;
  standard: "ERC721" | "ERC1155";
  name: string;
  collectionName: string;
  imageUrl: string;
  /** Units held. Always 1 for ERC-721. */
  balance: number;
  chainId: number;
};

type AlchemyOwnedNft = {
  contract?: { address?: string; name?: string; tokenType?: string; openSeaMetadata?: { imageUrl?: string } };
  tokenId?: string;
  name?: string;
  balance?: string;
  image?: { cachedUrl?: string; thumbnailUrl?: string; originalUrl?: string };
  raw?: { metadata?: { image?: string; name?: string } };
};

/**
 * Everything a wallet holds on one chain, one page at a time.
 *
 * Spam contracts are excluded: an unfiltered wallet is mostly airdropped
 * junk, and a profile that opens on fifty scam tokens is worse than one
 * that opens on nothing.
 */
export async function getNftsForOwner({
  owner,
  chainId,
  pageKey,
  pageSize = 48,
}: {
  owner: string;
  chainId: number;
  pageKey?: string;
  pageSize?: number;
}): Promise<{ nfts: WalletNft[]; pageKey: string | null }> {
  const base = nftBase(chainId);
  if (!base) return { nfts: [], pageKey: null };

  const params = new URLSearchParams({
    owner,
    withMetadata: "true",
    pageSize: String(pageSize),
    excludeFilters: "SPAM",
  });
  if (pageKey) params.set("pageKey", pageKey);

  const res = await fetch(`${base}/getNFTsForOwner?${params}`, {
    headers: { accept: "application/json" },
    // Holdings change on any transfer, and a stale profile is the exact
    // complaint this feature exists to answer.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Alchemy returned ${res.status}`);
  const data = (await res.json()) as { ownedNfts?: AlchemyOwnedNft[]; pageKey?: string | null };

  const nfts = (data.ownedNfts ?? [])
    .filter((n) => n.contract?.address && n.tokenId)
    .map((n): WalletNft => {
      const image =
        n.image?.cachedUrl || n.image?.thumbnailUrl || n.image?.originalUrl || n.raw?.metadata?.image || "";
      return {
        contractAddress: (n.contract!.address as string).toLowerCase(),
        tokenId: String(n.tokenId),
        standard: n.contract?.tokenType === "ERC1155" ? "ERC1155" : "ERC721",
        name: n.name || n.raw?.metadata?.name || `#${n.tokenId}`,
        collectionName: n.contract?.name || "Unnamed collection",
        // ipfs:// won't load in an <img>; a gateway URL will.
        imageUrl: image.startsWith("ipfs://")
          ? image.replace("ipfs://", "https://ipfs.io/ipfs/")
          : image,
        balance: Number(n.balance ?? 1) || 1,
        chainId,
      };
    });

  return { nfts, pageKey: data.pageKey ?? null };
}

export type OnChainTransfer = {
  txHash: string;
  from: string;
  to: string;
  quantity: number;
  /** Mint when it came from the zero address. */
  type: "mint" | "transfer";
  timestamp: string | null;
  blockNum: string;
};

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * The transfer history of one token, straight from the chain's index.
 *
 * Works for any contract, not just ones listed here — which is the point:
 * an NFT a holder brought in from elsewhere still gets a real history
 * rather than an empty tab.
 */
export async function getTokenTransfers({
  contractAddress,
  tokenId,
  chainId,
  limit = 50,
}: {
  contractAddress: string;
  tokenId?: string | null;
  chainId: number;
  limit?: number;
}): Promise<OnChainTransfer[]> {
  const base = rpcBase(chainId);
  if (!base) return [];

  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getAssetTransfers",
      params: [
        {
          fromBlock: "0x0",
          contractAddresses: [contractAddress],
          category: ["erc721", "erc1155"],
          withMetadata: true,
          order: "desc",
          maxCount: `0x${Math.min(limit * 4, 1000).toString(16)}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Alchemy returned ${res.status}`);
  const data = (await res.json()) as {
    error?: { message?: string };
    result?: {
      transfers?: {
        hash: string;
        from: string;
        to: string;
        tokenId?: string | null;
        erc1155Metadata?: { tokenId: string; value: string }[] | null;
        blockNum: string;
        metadata?: { blockTimestamp?: string };
      }[];
    };
  };
  if (data.error) throw new Error(data.error.message ?? "Alchemy transfer lookup failed");

  const wanted = tokenId ? BigInt(tokenId) : null;
  const out: OnChainTransfer[] = [];

  for (const t of data.result?.transfers ?? []) {
    // A 1155 transfer carries its token ids in a nested array and can move
    // several at once; a 721 carries one at the top level.
    const entries = t.erc1155Metadata?.length
      ? t.erc1155Metadata.map((m) => ({ id: BigInt(m.tokenId), qty: Number(BigInt(m.value)) }))
      : t.tokenId
        ? [{ id: BigInt(t.tokenId), qty: 1 }]
        : [];

    for (const e of entries) {
      if (wanted !== null && e.id !== wanted) continue;
      out.push({
        txHash: t.hash,
        from: t.from,
        to: t.to,
        quantity: e.qty,
        type: t.from?.toLowerCase() === ZERO ? "mint" : "transfer",
        timestamp: t.metadata?.blockTimestamp ?? null,
        blockNum: t.blockNum,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
