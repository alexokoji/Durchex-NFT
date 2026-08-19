"use client";

import { useEffect, useRef, useState } from "react";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, BadgeCheck, Loader2 } from "lucide-react";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { SearchResults } from "@/lib/types";

const EMPTY: SearchResults = { items: [], collections: [], users: [] };

export function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    const id = setTimeout(async () => {
      if (!trimmed) {
        setResults(EMPTY);
        return;
      }
      setLoading(true);
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=4`);
      setResults(await res.json());
      setLoading(false);
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  function goToResults() {
    if (!query.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  const hasResults = results.items.length + results.collections.length + results.users.length > 0;

  return (
    <div className="relative w-full" ref={ref}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && goToResults()}
        placeholder="Search items, collections, creators"
        className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-purple-500/60 focus:bg-white/[0.07] transition"
      />

      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full mt-2 glass-panel rounded-xl shadow-xl overflow-hidden z-50 max-h-[26rem] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-white/40">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : !hasResults ? (
            <p className="text-sm text-white/40 text-center py-8">No matches for &ldquo;{query}&rdquo;</p>
          ) : (
            <div className="p-1.5">
              {results.collections.length > 0 && (
                <Group label="Collections">
                  {results.collections.map((c) => (
                    <Link
                      key={c.id}
                      href={`/collection/${c.slug}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 transition"
                    >
                      <span className="w-7 h-7 rounded-md overflow-hidden shrink-0 bg-black">
                        {c.logoUrl ? <img src={c.logoUrl} alt="" className="w-full h-full object-cover" /> : <GeneratedArt seedKey={`logo-${c.slug}`} className="w-full h-full" />}
                      </span>
                      <span className="text-sm text-white truncate flex items-center gap-1">
                        {c.name}
                        {c.verified && <BadgeCheck className="w-3 h-3 text-purple-400 shrink-0" />}
                      </span>
                    </Link>
                  ))}
                </Group>
              )}
              {results.items.length > 0 && (
                <Group label="Items">
                  {results.items.map((it) => (
                    <Link
                      key={it.id}
                      href={`/assets/${it.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 transition"
                    >
                      <span className="w-7 h-7 rounded-md overflow-hidden shrink-0">
                        <GeneratedArt seedKey={it.id} className="w-full h-full" />
                      </span>
                      <span className="min-w-0">
                        <span className="text-sm text-white truncate block">{it.name}</span>
                        <span className="text-[11px] text-white/40 truncate block">
                          {it.collectionName}
                        </span>
                      </span>
                    </Link>
                  ))}
                </Group>
              )}
              {results.users.length > 0 && (
                <Group label="Creators">
                  {results.users.map((u) => (
                    <Link
                      key={u.address}
                      href={`/profile/${u.address}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 transition"
                    >
                      <span className="w-7 h-7 rounded-full overflow-hidden shrink-0">
                        <GeneratedArt seedKey={u.address} className="w-full h-full" />
                      </span>
                      <span className="text-sm text-white truncate flex items-center gap-1">
                        {u.username}
                        <VerifiedBadge tier={u.verificationTier} className="w-3 h-3" />
                      </span>
                    </Link>
                  ))}
                </Group>
              )}
              <button
                onClick={goToResults}
                className="w-full text-center text-xs font-medium text-purple-300 hover:text-white py-2.5 mt-1 border-t border-white/10 transition"
              >
                See all results for &ldquo;{query}&rdquo;
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1 last:mb-0">
      <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-white/30 font-semibold">
        {label}
      </div>
      {children}
    </div>
  );
}
