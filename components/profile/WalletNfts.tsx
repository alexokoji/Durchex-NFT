"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Package, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";

type WalletNft = {
  contractAddress: string;
  tokenId: string;
  standard: "ERC721" | "ERC1155";
  name: string;
  collectionName: string;
  collectionSlug: string | null;
  imageUrl: string;
  balance: number;
  chainId: number;
  onDurchex: boolean;
  itemId: string | null;
};

/**
 * Everything this wallet holds on-chain, wherever it was minted.
 *
 * Loaded in the browser rather than on the server because it is the
 * slowest thing on the page and the least essential — the profile should
 * render immediately and fill this in, not wait on a third-party index.
 */
export function WalletNfts({ address, isOwnProfile }: { address: string; isOwnProfile: boolean }) {
  const [nfts, setNfts] = useState<WalletNft[]>([]);
  const [pageKey, setPageKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(key?: string) {
    const params = new URLSearchParams({ address, chainId: "1" });
    if (key) params.set("pageKey", key);
    const res = await fetch(`/api/wallet/nfts?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't read this wallet");
    setUnavailable(!!data.unavailable);
    setNfts((prev) => (key ? [...prev, ...data.nfts] : data.nfts));
    setPageKey(data.pageKey ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't read this wallet"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-20 justify-center text-sm text-white/40">
        <Loader2 className="w-4 h-4 animate-spin text-purple-300" /> Reading the chain…
      </div>
    );
  }

  if (error) return <p className="text-sm text-danger py-10 text-center">{error}</p>;

  if (unavailable) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Wallet className="w-12 h-12 text-purple-500/40 mb-4" />
        <p className="text-sm text-white/40">Wallet lookup isn&rsquo;t configured for this network.</p>
      </div>
    );
  }

  if (nfts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Package className="w-12 h-12 text-purple-500/40 mb-4" />
        <p className="text-sm text-white/40">
          {isOwnProfile ? "This wallet doesn't hold any NFTs yet." : "This wallet holds no NFTs."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
        {nfts.map((nft) => (
          <WalletNftCard key={`${nft.contractAddress}-${nft.tokenId}`} nft={nft} isOwnProfile={isOwnProfile} />
        ))}
      </div>
      {pageKey && (
        <div className="flex justify-center mt-8">
          <Button
            variant="secondary"
            size="sm"
            disabled={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              load(pageKey)
                .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load more"))
                .finally(() => setLoadingMore(false));
            }}
          >
            {loadingMore ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}
    </>
  );
}

function WalletNftCard({ nft, isOwnProfile }: { nft: WalletNft; isOwnProfile: boolean }) {
  const body = (
    <>
      <div className="relative aspect-square bg-black/40">
        {nft.imageUrl ? (
          <img src={nft.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full grid place-items-center">
            <Package className="w-8 h-8 text-white/15" />
          </div>
        )}
        {nft.balance > 1 && (
          <span className="absolute top-2 right-2 rounded-full bg-black/70 border border-white/10 px-2 py-0.5 text-[10px] text-white tabular-nums">
            ×{nft.balance}
          </span>
        )}
        {!nft.onDurchex && (
          <span className="absolute top-2 left-2 rounded-full bg-black/70 border border-white/10 px-2 py-0.5 text-[10px] text-white/60">
            External
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="text-[11px] text-white/45 truncate">{nft.collectionName}</div>
        <div className="text-sm font-medium text-white truncate">{nft.name}</div>
      </div>
    </>
  );

  // Anything already on Durchex gets its real item page. Anything else
  // links out to Etherscan rather than to a page we can't render — a dead
  // link is worse than an honest one somewhere else.
  if (nft.onDurchex && nft.itemId) {
    return (
      <Link href={`/item/${nft.itemId}`} className="surface-card overflow-hidden hover:border-purple-500/40 transition block">
        {body}
      </Link>
    );
  }

  return (
    <div className="surface-card overflow-hidden">
      {body}
      <div className="px-3 pb-3 flex items-center justify-between gap-2">
        <a
          href={`https://etherscan.io/nft/${nft.contractAddress}/${nft.tokenId}`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[11px] text-white/40 hover:text-purple-300 transition"
        >
          <ExternalLink className="w-3 h-3" /> Etherscan
        </a>
        {isOwnProfile && (
          <span className="text-[10px] text-white/25" title="Importing outside collections is coming">
            Not listed here
          </span>
        )}
      </div>
    </div>
  );
}
