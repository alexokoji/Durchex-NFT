"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { X, ExternalLink, Copy, Check, Compass } from "lucide-react";
import { WALLETS, DEEPLINK_WALLETS, BROWSE_WALLETS, WalletEntry } from "@/lib/web3/wallets";
import { WALLETCONNECT_PROJECT_ID } from "@/lib/web3/config";

type ConnectFlowValue = { openConnect: () => void };

const ConnectFlowContext = createContext<ConnectFlowValue | null>(null);

/**
 * Opens the right connect UI for where the visitor is:
 *
 * - Desktop, or any browser that already injects a provider (i.e. we're
 *   inside a wallet's in-app browser, or an extension is installed):
 *   RainbowKit's modal, which can connect on the spot.
 * - A plain mobile browser, where no wallet can be reached in-page: our own
 *   sheet, which hands the visitor off into a wallet's in-app browser with
 *   this page loaded, so the connection happens there.
 */
export function useConnectFlow() {
  const context = useContext(ConnectFlowContext);
  if (!context) throw new Error("useConnectFlow must be used inside <ConnectFlowProvider>");
  return context;
}

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|windows phone/i.test(navigator.userAgent);
}

function hasInjectedProvider() {
  return typeof window !== "undefined" && !!(window as { ethereum?: unknown }).ethereum;
}

/** RainbowKit ships each wallet's icon as a data URI, sometimes lazily. */
function useWalletIcons() {
  const [icons, setIcons] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      WALLETS.map(async (entry) => {
        const { iconUrl } = entry.create({ projectId: WALLETCONNECT_PROJECT_ID });
        const resolved = typeof iconUrl === "function" ? await iconUrl() : iconUrl;
        return [entry.id, resolved] as const;
      })
    ).then((pairs) => {
      if (!cancelled) setIcons(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return icons;
}

function WalletRow({ entry, icon, onClick, trailing }: { entry: WalletEntry; icon?: string; onClick: () => void; trailing: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-purple-500/40 transition text-left"
    >
      <span className="w-9 h-9 rounded-lg overflow-hidden bg-white/5 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI from RainbowKit, no loader needed */}
        {icon && <img src={icon} alt="" className="w-full h-full object-cover" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-white truncate">{entry.name}</span>
        {entry.mobile.note && <span className="block text-[11px] text-white/35 truncate">{entry.mobile.note}</span>}
      </span>
      {trailing}
    </button>
  );
}

function MobileWalletSheet({ onClose }: { onClose: () => void }) {
  const icons = useWalletIcons();
  const { openConnectModal } = useConnectModal();
  const [manual, setManual] = useState<WalletEntry | null>(null);
  const [copied, setCopied] = useState(false);
  const siteUrl = useMemo(() => (typeof window === "undefined" ? "" : window.location.href), []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function openInWallet(entry: WalletEntry) {
    if (entry.mobile.kind !== "deeplink") return;
    window.location.assign(entry.mobile.build(siteUrl));
  }

  async function copyLink() {
    await navigator.clipboard?.writeText(siteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md max-h-[85vh] overflow-y-auto glass-panel rounded-t-2xl sm:rounded-2xl border-t border-white/10 p-5 pb-8">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-lg font-semibold text-white">Connect a wallet</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {manual ? (
          <>
            <p className="text-sm text-white/50 mb-5">
              {manual.name}
              {" has an in-app browser but doesn't publish a link that opens a site in it directly. Copy this page's address, then paste it into "}
              {manual.name}
              {"'s browser tab."}
            </p>
            <button
              onClick={copyLink}
              className="w-full flex items-center gap-2 px-3 py-3 rounded-xl border border-white/10 bg-white/[0.03] hover:border-purple-500/40 transition mb-3"
            >
              {copied ? <Check className="w-4 h-4 text-success shrink-0" /> : <Copy className="w-4 h-4 text-purple-300 shrink-0" />}
              <span className="text-sm text-white/80 truncate">{copied ? "Link copied" : siteUrl}</span>
            </button>
            <button onClick={() => setManual(null)} className="text-xs text-white/45 hover:text-white transition">
              ← Back to all wallets
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-white/45 mb-5">
              Pick a wallet and we&apos;ll reopen this page inside it, where it can connect.
            </p>

            <p className="text-[11px] uppercase tracking-wide text-white/30 font-semibold mb-2">Open in wallet app</p>
            <div className="space-y-2 mb-5">
              {DEEPLINK_WALLETS.map((entry) => (
                <WalletRow
                  key={entry.id}
                  entry={entry}
                  icon={icons[entry.id]}
                  onClick={() => openInWallet(entry)}
                  trailing={<ExternalLink className="w-4 h-4 text-white/30 shrink-0" />}
                />
              ))}
            </div>

            <p className="text-[11px] uppercase tracking-wide text-white/30 font-semibold mb-2">Other wallets</p>
            <div className="space-y-2">
              {BROWSE_WALLETS.map((entry) => (
                <WalletRow
                  key={entry.id}
                  entry={entry}
                  icon={icons[entry.id]}
                  onClick={() => setManual(entry)}
                  trailing={<Compass className="w-4 h-4 text-white/30 shrink-0" />}
                />
              ))}
            </div>

            <button
              onClick={() => {
                onClose();
                openConnectModal?.();
              }}
              className="w-full mt-5 py-2.5 rounded-xl text-xs font-medium text-white/55 border border-white/10 hover:text-white hover:bg-white/5 transition"
            >
              Already browsing inside a wallet? Connect here
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ConnectFlowProvider({ children }: { children: ReactNode }) {
  const { openConnectModal } = useConnectModal();
  const [sheetOpen, setSheetOpen] = useState(false);

  const openConnect = useCallback(() => {
    if (isMobileBrowser() && !hasInjectedProvider()) setSheetOpen(true);
    else openConnectModal?.();
  }, [openConnectModal]);

  const value = useMemo(() => ({ openConnect }), [openConnect]);

  return (
    <ConnectFlowContext.Provider value={value}>
      {children}
      {sheetOpen && <MobileWalletSheet onClose={() => setSheetOpen(false)} />}
    </ConnectFlowContext.Provider>
  );
}
