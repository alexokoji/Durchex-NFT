"use client";

import { useRouter, usePathname } from "next/navigation";
import clsx from "clsx";
import { RankingsTimeframe } from "@/lib/queries";

const OPTIONS: { value: RankingsTimeframe; label: string }[] = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "all", label: "All Time" },
];

export function TimeframeTabs({ active }: { active: RankingsTimeframe }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => router.push(`${pathname}?timeframe=${o.value}`)}
          className={clsx(
            "px-3.5 py-1.5 rounded-lg text-sm font-medium transition",
            active === o.value ? "bg-purple-700/40 text-white" : "text-white/50 hover:text-white"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
