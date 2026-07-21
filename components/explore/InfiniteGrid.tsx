"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Box } from "lucide-react";
import { NFTCard } from "@/components/nft/NFTCard";
import { ItemView } from "@/lib/types";

export function InfiniteGrid({
  initialItems,
  initialPageCount,
  queryString,
}: {
  initialItems: ItemView[];
  initialPageCount: number;
  queryString: string;
}) {
  // Note: this component is remounted via a `key={queryString}` from the
  // parent whenever filters change, so state only needs to initialize once
  // from props rather than re-sync in an effect.
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(initialPageCount);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || page >= pageCount) return;
    setLoading(true);
    const sp = new URLSearchParams(queryString);
    sp.set("page", String(page + 1));
    const res = await fetch(`/api/explore?${sp.toString()}`);
    const data = await res.json();
    setItems((prev) => [...prev, ...data.items]);
    setPage((p) => p + 1);
    setPageCount(data.pageCount);
    setLoading(false);
  }, [loading, page, pageCount, queryString]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Box className="w-14 h-14 text-purple-500/40 mb-4" />
        <h3 className="text-white font-semibold mb-1">No items match these filters</h3>
        <p className="text-sm text-white/40">Try adjusting the status or price range.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {items.map((item) => (
          <NFTCard key={item.id} item={item} />
        ))}
      </div>
      {page < pageCount && (
        <div ref={sentinelRef} className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
