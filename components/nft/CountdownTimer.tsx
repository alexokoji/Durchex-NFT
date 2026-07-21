"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

function getRemaining(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now();
  const clamped = Math.max(diff, 0);
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  return { clamped, h, m, s };
}

export function CountdownTimer({
  endsAt,
  compact = false,
}: {
  endsAt: string;
  compact?: boolean;
}) {
  // Start null so server and first client render both show the placeholder —
  // the real countdown (which depends on Date.now()) is only computed after
  // mount, avoiding a hydration mismatch.
  const [remaining, setRemaining] = useState<ReturnType<typeof getRemaining> | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(getRemaining(endsAt));
    const immediateId = setTimeout(tick, 0);
    const intervalId = setInterval(tick, 1000);
    return () => {
      clearTimeout(immediateId);
      clearInterval(intervalId);
    };
  }, [endsAt]);

  const urgent = (remaining?.clamped ?? Infinity) < 3_600_000;
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-1 font-mono tabular-nums rounded-md px-2 py-1 border",
        urgent
          ? "text-purple-200 border-purple-400/50 bg-purple-700/25 animate-pulse-glow"
          : "text-white/70 border-white/10 bg-white/5",
        compact ? "text-[11px]" : "text-sm"
      )}
    >
      <span>{remaining ? pad(remaining.h) : "--"}</span>:
      <span>{remaining ? pad(remaining.m) : "--"}</span>:
      <span>{remaining ? pad(remaining.s) : "--"}</span>
      {!compact && <span className="text-white/40 font-sans ml-1">left</span>}
    </div>
  );
}
