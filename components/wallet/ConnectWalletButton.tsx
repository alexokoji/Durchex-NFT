"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { ChevronDown, LogOut, Wallet, AlertTriangle, RotateCcw, User, Check, Loader2 } from "lucide-react";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { useSession } from "@/hooks/useSession";
import { useAutoSiweSignIn } from "@/hooks/useAutoSiweSignIn";
import { CHAIN_META, PRIMARY_CHAIN_IDS } from "@/lib/web3/config";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ConnectWalletButton() {
  const { isDisconnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { user, isLoading } = useSession();
  const { isSigningIn, error, retry } = useAutoSiweSignIn();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDisconnected && user) {
      fetch("/api/auth/logout", { method: "POST" });
    }
  }, [isDisconnected, user]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!ready) {
          return <div className="w-[150px] h-9 rounded-xl bg-white/5 animate-pulse" />;
        }

        if (!connected) {
          return (
            <button
              onClick={openConnectModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-b from-purple-600 to-purple-700 text-white shadow-[0_8px_24px_rgba(124,58,237,0.45)] hover:shadow-[0_10px_32px_rgba(124,58,237,0.6)] hover:-translate-y-0.5 border border-purple-500/40 transition-all"
            >
              <Wallet className="w-4 h-4" />
              Connect Wallet
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              onClick={openChainModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25 transition"
            >
              <AlertTriangle className="w-4 h-4" />
              Wrong network
            </button>
          );
        }

        // No separate "Sign In" step: as soon as the wallet connects,
        // useAutoSiweSignIn silently requests the signature. This branch
        // only ever shows a status (signing in / failed), never a button
        // that starts the flow — that already happened automatically.
        if (!isLoading && !user) {
          if (error) {
            return (
              <button
                onClick={retry}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry sign-in
              </button>
            );
          }
          return (
            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-surface-2 text-white/70 border border-white/10">
              <span className="w-3.5 h-3.5 border-2 border-purple-400/40 border-t-purple-400 rounded-full animate-spin" />
              {isSigningIn ? "Confirm in your wallet…" : "Signing in…"}
            </div>
          );
        }

        return (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-purple-500/40 transition"
            >
              <span className="w-6 h-6 rounded-full overflow-hidden">
                <GeneratedArt seedKey={account.address} className="w-full h-full" />
              </span>
              <span className="text-sm font-medium text-white">
                {user?.username ?? truncateAddress(account.address)}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-white/50" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 glass-panel rounded-xl shadow-xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/10">
                  <div className="text-xs text-white/40">Signed in as</div>
                  <div className="text-sm font-medium text-white truncate">
                    {truncateAddress(account.address)}
                  </div>
                </div>

                <div className="px-4 py-2.5 border-b border-white/10">
                  <div className="text-[10px] uppercase tracking-wide text-white/30 font-semibold mb-1.5">
                    Network
                  </div>
                  <div className="max-h-48 overflow-y-auto -mx-1">
                    {PRIMARY_CHAIN_IDS.map((id) => {
                      const meta = CHAIN_META[id];
                      const isActive = id === chain.id;
                      return (
                        <button
                          key={id}
                          onClick={async () => {
                            if (isActive) return;
                            setSwitchingTo(id);
                            try {
                              await switchChainAsync({ chainId: id as never });
                            } catch {
                              // user rejected or wallet doesn't support it — no-op
                            } finally {
                              setSwitchingTo(null);
                            }
                          }}
                          disabled={isSwitchingChain && switchingTo === id}
                          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm hover:bg-white/5 transition disabled:opacity-60"
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: meta.accent }}
                          />
                          <span className="flex-1 text-left text-white/80">{meta.label}</span>
                          {switchingTo === id ? (
                            <Loader2 className="w-3.5 h-3.5 text-purple-300 animate-spin" />
                          ) : (
                            isActive && <Check className="w-3.5 h-3.5 text-purple-300" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Link
                  href={`/profile/${account.address}`}
                  onClick={() => setMenuOpen(false)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5 transition"
                >
                  <User className="w-4 h-4" />
                  My Profile
                </Link>
                <button
                  onClick={() => disconnect()}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition"
                >
                  <LogOut className="w-4 h-4" />
                  Disconnect
                </button>
              </div>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
