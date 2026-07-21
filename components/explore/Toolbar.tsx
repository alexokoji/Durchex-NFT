"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, Rows3 } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";

const SORT_OPTIONS = [
  { value: "recent", label: "Recently Listed" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "favorites", label: "Most Favorited" },
  { value: "ending_soon", label: "Ending Soon" },
];

export function Toolbar({ total }: { total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dense, setDense] = useState(false);
  const sort = searchParams.get("sort") ?? "recent";

  function updateSort(value: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("sort", value);
    sp.delete("page");
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="flex items-center justify-between gap-4 mb-5">
      <div className="text-sm text-white/50">
        <span className="text-white font-semibold">{total.toLocaleString()}</span> items
      </div>
      <div className="flex items-center gap-2">
        <select
          value={sort}
          onChange={(e) => updateSort(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/60"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-surface-2">
              {o.label}
            </option>
          ))}
        </select>
        <div className="hidden sm:flex items-center rounded-lg border border-white/10 overflow-hidden">
          <button
            onClick={() => setDense(false)}
            className={clsx("p-2", !dense ? "bg-purple-700/30 text-white" : "text-white/40")}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDense(true)}
            className={clsx("p-2", dense ? "bg-purple-700/30 text-white" : "text-white/40")}
          >
            <Rows3 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
