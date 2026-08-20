"use client";

import Link from "next/link";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { Tag, Gavel, ShoppingBag, Sparkles, ArrowLeftRight, XCircle } from "lucide-react";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { ActivityView } from "@/lib/types";

const TYPE_META: Record<
  ActivityView["type"],
  { icon: typeof Tag; label: string; color: string }
> = {
  list: { icon: Tag, label: "Listed", color: "text-purple-300" },
  sale: { icon: ShoppingBag, label: "Sale", color: "text-success" },
  bid: { icon: Gavel, label: "Bid", color: "text-purple-300" },
  offer: { icon: Tag, label: "Offer", color: "text-purple-300" },
  mint: { icon: Sparkles, label: "Minted", color: "text-pink-purple" },
  transfer: { icon: ArrowLeftRight, label: "Transfer", color: "text-white/60" },
  cancel: { icon: XCircle, label: "Cancelled", color: "text-danger" },
};

function truncate(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ActivityRow({ activity }: { activity: ActivityView }) {
  const { format } = useCurrency();
  const meta = TYPE_META[activity.type];

  return (
    <Link
      href={`/assets/${activity.itemId}`}
      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition"
    >
      <span className={`w-8 h-8 rounded-lg bg-white/5 border border-white/10 grid place-items-center shrink-0 ${meta.color}`}>
        <meta.icon className="w-4 h-4" />
      </span>

      <span className="w-9 h-9 rounded-lg overflow-hidden shrink-0">
        <GeneratedArt seedKey={activity.itemId} className="w-full h-full" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-sm text-white truncate">
          <span className="font-medium">{activity.itemName}</span>
          <span className="text-white/40"> · {activity.collectionName}</span>
        </div>
        <div className="text-[11px] text-white/40">
          {meta.label}
          {activity.from && <> by {activity.from.username ?? truncate(activity.from.address)}</>}
          {activity.to && <> to {activity.to.username ?? truncate(activity.to.address)}</>}
        </div>
      </div>

      <div className="text-right shrink-0">
        {activity.priceEth !== null && (
          <div className="text-sm font-semibold text-white tabular-nums">
            {format(activity.priceEth)}
          </div>
        )}
        <div className="text-[11px] text-white/40">
          {new Date(activity.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </div>
      </div>
    </Link>
  );
}
