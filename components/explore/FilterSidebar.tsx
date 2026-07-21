"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { SlidersHorizontal, ChevronDown } from "lucide-react";
import clsx from "clsx";

const STATUS_OPTIONS = [
  { value: "", label: "All items" },
  { value: "fixed_price", label: "Buy Now" },
  { value: "auction", label: "On Auction" },
  { value: "sold", label: "Recently Sold" },
];

export interface TraitFacets {
  [traitType: string]: { value: string; count: number }[];
}

export function FilterSidebar({ traitFacets }: { traitFacets?: TraitFacets }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") ?? "");

  const activeStatus = searchParams.get("status") ?? "";

  const selectedTraits: Record<string, string[]> = useMemo(() => {
    const raw = searchParams.get("traits");
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }, [searchParams]);

  function updateParam(key: string, value: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    sp.delete("page");
    router.push(`${pathname}?${sp.toString()}`);
  }

  function applyPriceRange() {
    const sp = new URLSearchParams(searchParams.toString());
    if (minPrice) sp.set("minPrice", minPrice);
    else sp.delete("minPrice");
    if (maxPrice) sp.set("maxPrice", maxPrice);
    else sp.delete("maxPrice");
    sp.delete("page");
    router.push(`${pathname}?${sp.toString()}`);
  }

  function toggleTrait(traitType: string, value: string) {
    const next: Record<string, string[]> = { ...selectedTraits };
    const current = next[traitType] ?? [];
    next[traitType] = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    if (next[traitType].length === 0) delete next[traitType];

    const sp = new URLSearchParams(searchParams.toString());
    if (Object.keys(next).length > 0) sp.set("traits", JSON.stringify(next));
    else sp.delete("traits");
    sp.delete("page");
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <aside className="w-full lg:w-64 shrink-0 space-y-6">
      <div className="surface-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
          <SlidersHorizontal className="w-4 h-4 text-purple-400" />
          Status
        </div>
        <div className="space-y-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateParam("status", opt.value || null)}
              className={clsx(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition",
                activeStatus === opt.value
                  ? "bg-purple-700/25 text-white border border-purple-500/40"
                  : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="surface-card p-4">
        <div className="text-sm font-semibold text-white mb-3">Price range (ETH)</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
          />
          <span className="text-white/30">–</span>
          <input
            type="number"
            placeholder="Max"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
          />
        </div>
        <button
          onClick={applyPriceRange}
          className="w-full mt-3 py-2 rounded-lg bg-purple-700/25 border border-purple-500/40 text-sm font-medium text-white hover:bg-purple-700/40 transition"
        >
          Apply
        </button>
      </div>

      {traitFacets &&
        Object.entries(traitFacets).map(([traitType, values]) => (
          <TraitAccordion
            key={traitType}
            traitType={traitType}
            values={values}
            selected={selectedTraits[traitType] ?? []}
            onToggle={(value) => toggleTrait(traitType, value)}
          />
        ))}
    </aside>
  );
}

function TraitAccordion({
  traitType,
  values,
  selected,
  onToggle,
}: {
  traitType: string;
  values: { value: string; count: number }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="surface-card p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-sm font-semibold text-white mb-1"
      >
        {traitType}
        <ChevronDown className={clsx("w-4 h-4 text-white/40 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-0.5 mt-2 max-h-56 overflow-y-auto">
          {values.map((v) => (
            <label
              key={v.value}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-sm"
            >
              <span className="flex items-center gap-2 text-white/70 truncate">
                <input
                  type="checkbox"
                  checked={selected.includes(v.value)}
                  onChange={() => onToggle(v.value)}
                  className="accent-purple-600 shrink-0"
                />
                <span className="truncate">{v.value}</span>
              </span>
              <span className="text-white/30 text-xs shrink-0">{v.count}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
