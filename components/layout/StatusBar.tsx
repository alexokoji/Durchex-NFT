"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { CurrencyToggle } from "@/components/ui/CurrencyToggle";

/**
 * The thin bar pinned to the bottom of every page.
 *
 * It replaces a full-height footer, which was three columns of links
 * almost nobody scrolled to the bottom to reach — while the things people
 * genuinely want at hand, like whether the site is live and what ETH is
 * worth, were only visible if you went looking. Everything worth keeping
 * from that footer is here: the same links, the socials, the copyright.
 *
 * Wide screens show the links inline. Narrow ones put them behind a single
 * control, because a bar that wraps onto three lines is a footer again.
 */
const LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/rankings", label: "Rankings" },
  { href: "/drops", label: "Drops" },
  { href: "/stats", label: "Stats" },
  { href: "/create", label: "Create" },
  { href: "/activity", label: "Activity" },
];

const SOCIALS = [
  { label: "X", href: "https://x.com/DurchExc" },
  { label: "Discord", href: "https://discord.gg/VbRVnUS5wn" },
];

export function StatusBar() {
  const { rate } = useCurrency();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // The rate differs per visitor and arrives after mount, so rendering it
  // on the server would only produce a hydration mismatch.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 chrome-panel border-t border-white/8">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-10 flex items-center justify-between gap-3 text-[11px] text-white/45">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-white/60">Live</span>
          </span>

          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hidden lg:inline hover:text-white transition">
              {l.label}
            </Link>
          ))}

          <div className="relative lg:hidden" ref={menuRef}>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="flex items-center gap-1 hover:text-white transition"
            >
              Menu <ChevronUp className={`w-3 h-3 transition ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <div className="absolute bottom-8 left-0 w-44 rounded-xl border border-white/10 bg-surface-1 p-1.5 shadow-xl">
                {LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white transition"
                  >
                    {l.label}
                  </Link>
                ))}
                <div className="border-t border-white/10 mt-1.5 pt-1.5 flex gap-2 px-3 py-1">
                  {SOCIALS.map((s) => (
                    <a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-white/50 hover:text-white transition"
                    >
                      {s.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <span className="hidden xl:inline text-white/25 truncate">
            © {new Date().getFullYear()} Durchex
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
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
              className="hidden lg:inline hover:text-white transition"
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
