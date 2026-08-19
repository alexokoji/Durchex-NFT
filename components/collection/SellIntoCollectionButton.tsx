"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Tag } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { CollectionDetailView } from "@/lib/types";

type Holding = { id: string; name: string; quantity: number };

/**
 * "Sell" beside "Buy Floor", for holders of this collection.
 *
 * Listing happens on an item's own page, because the price and quantity
 * belong to a specific token. What was missing was any route to it from
 * the collection — a holder had to already know which of their items to
 * open. This finds what they hold and takes them there, and renders
 * nothing at all for someone who holds none, so the header doesn't offer
 * an action that leads to an empty page.
 */
export function SellIntoCollectionButton({ collection }: { collection: CollectionDetailView }) {
  const { user } = useSession();
  const router = useRouter();
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/collections/${collection.id}/my-holdings`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setHoldings(data.holdings ?? []));
  }, [user, collection.id]);

  if (!user || !holdings || holdings.length === 0) return null;

  // One holding needs no choosing.
  if (holdings.length === 1) {
    return (
      <button
        onClick={() => router.push(`/assets/${holdings[0].id}#sell`)}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:border-purple-500/40 transition"
      >
        <Tag className="w-4 h-4 text-purple-300" /> Sell
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:border-purple-500/40 transition"
      >
        <Tag className="w-4 h-4 text-purple-300" /> Sell
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-64 rounded-xl border border-white/10 bg-surface-1 p-1.5 shadow-xl">
          {holdings.map((h) => (
            <button
              key={h.id}
              onClick={() => router.push(`/assets/${h.id}#sell`)}
              className="w-full text-left rounded-lg px-3 py-2 hover:bg-white/5 transition"
            >
              <div className="text-sm text-white truncate">{h.name}</div>
              <div className="text-[11px] text-white/40">You hold {h.quantity}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SellButtonFallback() {
  return <Loader2 className="w-4 h-4 animate-spin text-white/30" />;
}
