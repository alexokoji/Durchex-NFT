"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { CurrencyToggle } from "@/components/ui/CurrencyToggle";

/**
 * The thin bar pinned to the bottom of every page.
 *
 * A marketplace's footer is mostly navigation nobody scrolls to. The
 * things people actually want at hand — is the site live, what is ETH
 * worth, which currency am I reading — belong somewhere always visible,
 * so this stays put while the page moves, the way the header does.
 *
 * The full link columns still exist above it; this is the always-on strip,
 * not a replacement for them.
 */
const SOCIALS = [
  { label: "X", href: "https://x.com/DurchExc" },
  { label: "Discord", href: "https://discord.gg/VbRVnUS5wn" },
];

export function StatusBar() {
  const { rate } = useCurrency();
  // Rendered only after mount: the year and the live dot are the same on
  // the server for everyone, but the rate isn't, and a mismatch on first
  // paint is a hydration warning for no gain.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 chrome-panel border-t border-white/8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-10 flex items-center justify-between gap-4 text-[11px] text-white/45">
        <div className="flex items-center gap-4 min-w-0">
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-white/60">Live</span>
          </span>
          <Link href="/explore" className="hidden sm:inline hover:text-white transition">
            Explore
          </Link>
          <Link href="/rankings" className="hidden sm:inline hover:text-white transition">
            Rankings
          </Link>
          <Link href="/stats" className="hidden md:inline hover:text-white transition">
            Stats
          </Link>
          <span className="hidden lg:inline truncate">
            © {new Date().getFullYear()} Durchex
          </span>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {ready && rate && (
            <span className="tabular-nums text-white/60">
              ETH ${rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          )}
          {SOCIALS.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noreferrer noopener"
              className="hidden sm:inline hover:text-white transition"
            >
              {s.label}
            </a>
          ))}
          <CurrencyToggle />
        </div>
      </div>
    </div>
  );
}
