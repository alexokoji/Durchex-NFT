import Link from "next/link";
import { LogoMark } from "@/components/layout/Logo";

const SOCIALS = [
  { label: "Durchex on X", href: "https://x.com/DurchExc", Icon: XIcon },
  { label: "Durchex on Discord", href: "https://discord.gg/VbRVnUS5wn", Icon: DiscordIcon },
];

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.36-.444.83-.608 1.2a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.2.077.077 0 0 0-.079-.037c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.246.195.373.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.311-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.311-.946 2.38-2.157 2.38z" />
    </svg>
  );
}

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
      { href: "/activity", label: "Activity" },
    ],
  },
  {
    title: "Resources",
    links: [
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
            {SOCIALS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={label}
                className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 grid place-items-center text-white/50 hover:text-purple-300 hover:border-purple-500/40 transition"
              >
                <Icon className="w-4 h-4" />
              </a>
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
    </footer>
  );
}
