import { SearchX } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import Link from "next/link";
import { search } from "@/lib/queries";
import { NFTCard } from "@/components/nft/NFTCard";
import { CollectionCard } from "@/components/nft/CollectionCard";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { UserAvatar } from "@/components/ui/UserAvatar";

// Live marketplace data — never prerender a stale snapshot at build time.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q = "" } = await searchParams;
  const results = q.trim() ? await search(q, 24) : { items: [], collections: [], users: [] };
  const total = results.items.length + results.collections.length + results.users.length;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-2">
        {q ? (
          <>
            Results for <span className="text-gradient-purple">&ldquo;{q}&rdquo;</span>
          </>
        ) : (
          "Search"
        )}
      </h1>
      <p className="text-white/50 text-sm mb-10">
        {q ? `${total} match${total === 1 ? "" : "es"} across items, collections and creators.` : "Search items, collections and creators."}
      </p>

      {q && total === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <SearchX className="w-12 h-12 text-purple-500/40 mb-4" />
          <p className="text-sm text-white/40">No matches. Try a different search.</p>
        </div>
      )}

      {results.collections.length > 0 && (
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-4">Collections</h2>
          <div className="flex gap-5 overflow-x-auto pb-2 px-1">
            {results.collections.map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </div>
        </section>
      )}

      {results.users.length > 0 && (
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-4">Creators</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {results.users.map((u) => (
              <Link
                key={u.address}
                href={`/profile/${u.address}`}
                className="surface-card surface-card-hover flex items-center gap-3 p-3.5"
              >
                <UserAvatar address={u.address} avatarUrl={u.avatarUrl} className="w-10 h-10" />
                <span className="text-sm font-medium text-white flex items-center gap-1 truncate">
                  {u.username}
                  <VerifiedBadge tier={u.verificationTier} className="w-3.5 h-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results.items.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Items</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {results.items.map((it) => (
              <NFTCard key={it.id} item={it} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
