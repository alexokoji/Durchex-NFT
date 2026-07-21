"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, Bell, BellRing } from "lucide-react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import clsx from "clsx";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { CountdownTimer } from "@/components/nft/CountdownTimer";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/hooks/useSession";
import { DropView } from "@/lib/types";

export function DropCard({ drop }: { drop: DropView }) {
  const { user } = useSession();
  const { openConnectModal } = useConnectModal();
  const [notifying, setNotifying] = useState(drop.isNotifying);
  const [count, setCount] = useState(drop.notifyCount);
  const [pending, setPending] = useState(false);
  const isLive = drop.isLive;

  async function toggleNotify() {
    if (!user) {
      openConnectModal?.();
      return;
    }
    if (pending) return;
    setPending(true);
    const next = !notifying;
    setNotifying(next);
    setCount((c) => c + (next ? 1 : -1));
    try {
      const res = await fetch(`/api/drops/${drop.id}/notify`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setNotifying(data.notifying);
      setCount(data.count);
    } catch {
      setNotifying(!next);
      setCount((c) => c + (next ? -1 : 1));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="surface-card overflow-hidden relative group">
      <Link href={`/collection/${drop.slug}`} className="block relative h-56 overflow-hidden">
        <GeneratedArt
          seedKey={`drop-${drop.slug}`}
          className="w-full h-full transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/20 to-transparent" />
        <span
          className={clsx(
            "absolute top-3 left-3 px-2.5 py-1 rounded-md text-[11px] font-semibold backdrop-blur",
            isLive
              ? "bg-success/20 text-success border border-success/40"
              : "bg-purple-700/30 text-purple-200 border border-purple-400/30"
          )}
        >
          {isLive ? "● Live now" : "Upcoming"}
        </span>
      </Link>

      <div className="p-6 -mt-14 relative">
        <div className="text-[11px] text-white/40 mb-1.5">
          {isLive ? "Minting ends in" : "Minting starts in"}
        </div>
        <CountdownTimer endsAt={isLive ? drop.dropEndsAt : drop.dropStartsAt} />

        <Link href={`/collection/${drop.slug}`} className="block mt-3 mb-1.5">
          <h3 className="font-display text-xl font-semibold text-white flex items-center gap-1.5 hover:text-purple-300 transition">
            {drop.name}
            {drop.verified && <BadgeCheck className="w-4 h-4 text-purple-400 shrink-0" />}
          </h3>
        </Link>
        <p className="text-sm text-white/50 mb-4">
          Floor {drop.floorEth > 0 ? `starts at ${drop.floorEth.toFixed(2)} ETH` : "TBA"} ·{" "}
          {drop.items.toLocaleString()} items
        </p>

        <div className="flex items-center gap-3">
          <Button
            variant={notifying ? "secondary" : "outline"}
            size="sm"
            icon={notifying ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
            onClick={toggleNotify}
          >
            {notifying ? "Notifying" : "Notify me"}
          </Button>
          {count > 0 && <span className="text-xs text-white/40">{count.toLocaleString()} watching</span>}
        </div>
      </div>
    </div>
  );
}
