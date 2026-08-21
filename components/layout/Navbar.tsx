"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { CurrencyToggle } from "@/components/ui/CurrencyToggle";
import { WalletBalance } from "@/components/wallet/WalletBalance";
import { NetworkSwitcher } from "@/components/wallet/NetworkSwitcher";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SearchBox } from "@/components/layout/SearchBox";
import { LogoMark } from "@/components/layout/Logo";

// Wallet Checker is deliberately absent: it only matters while an
// allowlist is being run, and a permanent link to it the rest of the time
// is a dead end for almost everyone. The page itself is untouched at
// /wallet-checker, and admins still reach it from Admin › Wallet Checker,
// so putting it back is a one-line change rather than a rebuild.
const NAV_LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/rankings", label: "Rankings" },
  { href: "/drops", label: "Drops" },
  { href: "/stats", label: "Stats" },
  { href: "/creator", label: "Creator Studio" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [liveDrop, setLiveDrop] = useState<{ slug: string; name: string } | null>(null);

  useEffect(() => {
    fetch("/api/drops/live")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.liveDrop && setLiveDrop(data.liveDrop))
      .catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-50">
      {liveDrop && (
        <Link
          href={`/collection/${liveDrop.slug}`}
          className="block w-full bg-gradient-to-r from-purple-900 via-purple-700 to-pink-purple/80 text-center text-xs sm:text-sm py-1.5 px-4 text-white/90 hover:brightness-110 transition"
        >
          <Sparkles className="inline w-3.5 h-3.5 mb-0.5 mr-1.5 text-purple-300" />
          New drop: <span className="font-semibold text-white">{liveDrop.name}</span> mints live now — real lazy-minted, zero gas to list.
        </Link>
      )}
      <nav className="chrome-panel border-b border-white/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <LogoMark className="w-8 h-8" />
            <span className="font-display font-semibold text-lg tracking-tight text-white">
              Durchex
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1 flex-1 max-w-md">
            <SearchBox />
          </div>

          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="px-3.5 py-2 text-sm font-medium text-white/70 hover:text-white rounded-lg hover:bg-white/5 transition"
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <Button href="/create" variant="secondary" size="sm">
              Create
            </Button>
            <CurrencyToggle />
            <WalletBalance />
            <NetworkSwitcher compact />
            <NotificationBell />
            <ConnectWalletButton />
          </div>

          <button
            className="lg:hidden text-white/80 p-2"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {open && (
          <div className="lg:hidden px-4 pb-4 flex flex-col gap-1 border-t border-white/5 pt-3">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="px-3 py-2.5 text-sm font-medium text-white/80 hover:text-white rounded-lg hover:bg-white/5"
              >
                {l.label}
              </Link>
            ))}
            <div className="flex items-center gap-2 mt-2">
              <Button href="/create" variant="secondary" size="sm" className="flex-1">
                Create
              </Button>
              <NetworkSwitcher />
              <CurrencyToggle className="self-start" />
              <WalletBalance />
              <ConnectWalletButton />
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
