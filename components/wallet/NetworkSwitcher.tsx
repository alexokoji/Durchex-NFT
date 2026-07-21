"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import clsx from "clsx";
import { useAccount, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { CHAIN_META, PRIMARY_CHAIN_IDS } from "@/lib/web3/config";

/**
 * Network switcher shown in the header (works standalone) and reused inside
 * ConnectWalletButton's dropdown. All 8 EVM chains from the deployment-cost
 * estimate are listed — Solana and Tezos aren't here since they're not EVM
 * and a connected EVM wallet can't switch to them.
 */
export function NetworkSwitcher({ compact = false }: { compact?: boolean }) {
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync, isPending } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const active = chainId && CHAIN_META[chainId] ? CHAIN_META[chainId] : null;

  async function pick(id: number) {
    setError(null);
    if (!isConnected) {
      setOpen(false);
      openConnectModal?.();
      return;
    }
    if (id === chainId) {
      setOpen(false);
      return;
    }
    setSwitchingTo(id);
    try {
      await switchChainAsync({ chainId: id as never });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Couldn't switch network");
    } finally {
      setSwitchingTo(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-purple-500/40 transition",
          compact ? "px-2.5 py-1.5" : "px-3 py-2"
        )}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: active?.accent ?? "#6B6478" }}
        />
        {!compact && (
          <span className="text-sm font-medium text-white/80 whitespace-nowrap">
            {active?.label ?? "Select Network"}
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-white/40" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 glass-panel rounded-xl shadow-xl overflow-hidden z-50">
          <div className="px-4 py-2.5 border-b border-white/10 text-[11px] uppercase tracking-wide text-white/40">
            {isConnected ? "Switch network" : "Preview networks"}
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {PRIMARY_CHAIN_IDS.map((id) => {
              const meta = CHAIN_META[id];
              const isActive = id === chainId;
              return (
                <button
                  key={id}
                  onClick={() => pick(id)}
                  disabled={isPending && switchingTo === id}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-white/5 transition disabled:opacity-60"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: meta.accent }}
                  />
                  <span className="flex-1 text-left text-white/85">{meta.label}</span>
                  <span className="text-[11px] text-white/30">{meta.symbol}</span>
                  {switchingTo === id ? (
                    <Loader2 className="w-3.5 h-3.5 text-purple-300 animate-spin" />
                  ) : (
                    isActive && <Check className="w-3.5 h-3.5 text-purple-300" />
                  )}
                </button>
              );
            })}
          </div>
          {!isConnected && (
            <div className="px-4 py-2.5 border-t border-white/10 text-[11px] text-white/40">
              Connect a wallet to actually switch networks.
            </div>
          )}
          {error && (
            <div className="px-4 py-2 border-t border-white/10 text-[11px] text-danger">{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
