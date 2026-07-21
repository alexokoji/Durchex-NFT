"use client";

import { useState } from "react";
import clsx from "clsx";
import { Package } from "lucide-react";
import { NFTCard } from "@/components/nft/NFTCard";
import { ItemView } from "@/lib/types";

const TABS = ["Owned", "Created", "Favorited"] as const;
type Tab = (typeof TABS)[number];

export function ProfileTabs({
  owned,
  created,
  favorited,
}: {
  owned: ItemView[];
  created: ItemView[];
  favorited: ItemView[];
}) {
  const [tab, setTab] = useState<Tab>("Owned");
  const data: Record<Tab, ItemView[]> = { Owned: owned, Created: created, Favorited: favorited };
  const items = data[tab];

  return (
    <div className="px-4 sm:px-8 mt-10">
      <div className="flex gap-1 border-b border-white/10 mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "px-4 py-3 text-sm font-medium border-b-2 -mb-px transition",
              tab === t ? "border-purple-500 text-white" : "border-transparent text-white/45 hover:text-white"
            )}
          >
            {t}
            <span className="ml-1.5 text-xs text-white/30">{data[t].length}</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="w-12 h-12 text-purple-500/40 mb-4" />
          <p className="text-sm text-white/40">Nothing here yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
          {items.map((item) => (
            <NFTCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
