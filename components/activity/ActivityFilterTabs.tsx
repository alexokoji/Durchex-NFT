"use client";

import { useRouter, usePathname } from "next/navigation";
import clsx from "clsx";
import { ActivityType } from "@/lib/queries";

const OPTIONS: { value: ActivityType | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "sale", label: "Sales" },
  { value: "list", label: "Listings" },
  { value: "bid", label: "Bids" },
  { value: "offer", label: "Offers" },
  { value: "mint", label: "Mints" },
];

export function ActivityFilterTabs({ active }: { active?: ActivityType }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => router.push(o.value ? `${pathname}?type=${o.value}` : pathname)}
          className={clsx(
            "shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-medium border transition",
            (active ?? "") === o.value
              ? "bg-purple-700/25 border-purple-500/40 text-white"
              : "border-white/10 text-white/50 hover:text-white hover:border-white/20"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
