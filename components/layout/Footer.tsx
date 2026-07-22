import Link from "next/link";
import { Send, MessageCircle, Globe, Rss } from "lucide-react";
import { LogoMark } from "@/components/layout/Logo";

const COLUMNS = [
  {
    title: "Marketplace",
    links: [
      { href: "/explore", label: "Explore" },
      { href: "/rankings", label: "Rankings" },
      { href: "/drops", label: "Drops" },
      { href: "/stats", label: "Stats" },
    ],
  },
  {
    title: "Create",
    links: [
      { href: "/create", label: "Create an Item" },
      { href: "/create/collection", label: "Create a Collection" },
      { href: "/activity", label: "Activity" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs/spec", label: "Full Specification (PDF)" },
      { href: "/settings", label: "Settings" },
      { href: "/notifications", label: "Notifications" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-void">
      <div className="max-w-7xl mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-5 gap-10">
        <div className="col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <LogoMark className="w-7 h-7" />
            <span className="font-display font-semibold text-lg text-white">Durchex</span>
          </div>
          <p className="text-sm text-white/50 max-w-xs leading-relaxed">
            Durchex is a digital marketplace for discovering, creating, and trading
            NFTs, built on secure lazy-minting infrastructure so creators can list
            instantly with zero upfront gas.
          </p>
          <div className="flex items-center gap-3 mt-5">
            {[Send, MessageCircle, Globe, Rss].map((Icon, i) => (
              <span
                key={i}
                className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 grid place-items-center text-white/50 hover:text-purple-300 hover:border-purple-500/40 transition cursor-pointer"
              >
                <Icon className="w-4 h-4" />
              </span>
            ))}
          </div>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h4 className="text-sm font-semibold text-white mb-3">{col.title}</h4>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-white/50 hover:text-purple-300 transition"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
          <span>© {new Date().getFullYear()} Durchex. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
