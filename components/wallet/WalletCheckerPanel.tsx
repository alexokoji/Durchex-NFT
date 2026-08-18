"use client";

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { Wallet, ShieldCheck, ShieldX, Loader2, Search, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";

type PhaseResult = { eligible: boolean; label: string | null };
type CheckResult = {
  address: string;
  phases: { gtd: PhaseResult; fcfs: PhaseResult };
  published: { gtd: boolean; fcfs: boolean };
  eligible: boolean;
};

const PHASES = [
  {
    key: "gtd" as const,
    title: "GTD",
    subtitle: "Guaranteed mint",
    blurb: "Your spot is reserved for the whole GTD window — no race, mint any time before it closes.",
  },
  {
    key: "fcfs" as const,
    title: "FCFS",
    subtitle: "First come, first served",
    blurb: "A shared allocation opens to everyone on this list at once. Be early — it closes when it sells out.",
  },
];

function truncate(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function PhaseCard({ phase, result }: { phase: (typeof PHASES)[number]; result: CheckResult | null }) {
  const outcome = result?.phases[phase.key];
  const eligible = !!outcome?.eligible;
  const published = result ? result.published[phase.key] : true;

  return (
    <div
      className={clsx(
        "surface-card p-6 transition-colors",
        result && eligible && "border-success/40 bg-success/5",
        result && !eligible && "border-white/10"
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-white">{phase.title}</h3>
          <p className="text-xs text-white/40">{phase.subtitle}</p>
        </div>
        {result &&
          (eligible ? (
            <ShieldCheck className="w-6 h-6 text-success shrink-0" />
          ) : (
            <ShieldX className="w-6 h-6 text-white/25 shrink-0" />
          ))}
      </div>

      <p className="text-sm text-white/50 mb-4">{phase.blurb}</p>

      {!result ? (
        <div className="text-xs text-white/30 border-t border-white/5 pt-3">Check your wallet to see your status.</div>
      ) : eligible ? (
        <div className="border-t border-success/20 pt-3">
          <p className="text-sm font-semibold text-success">You&apos;re eligible for {phase.title}.</p>
          {outcome?.label && <p className="text-xs text-white/50 mt-1">Note from the team: {outcome.label}</p>}
        </div>
      ) : (
        <div className="border-t border-white/5 pt-3">
          <p className="text-sm text-white/55">
            {published ? `This wallet isn't on the ${phase.title} list.` : `The ${phase.title} list hasn't been published yet.`}
          </p>
        </div>
      )}
    </div>
  );
}

export function WalletCheckerPanel() {
  const { address, isConnected } = useAccount();
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different wallet than the one the last result is for — the shown
  // result is stale until it's re-checked.
  const stale = !!result && !!address && result.address !== address.toLowerCase();

  async function check() {
    if (!address) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/allowlist-check?address=${address}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't check that wallet — try again.");
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="surface-card p-6 sm:p-8 text-center">
        {!isConnected ? (
          <>
            <Wallet className="w-10 h-10 text-purple-400/70 mx-auto mb-4" />
            <p className="text-white font-medium mb-1">Connect your wallet to begin</p>
            <p className="text-sm text-white/45 mb-6">
              We only read your address — no signature, no transaction, nothing leaves your wallet.
            </p>
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => (
                <Button onClick={openConnectModal} disabled={!mounted} size="lg" icon={<Wallet className="w-4 h-4" />}>
                  Connect Wallet
                </Button>
              )}
            </ConnectButton.Custom>
          </>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wide text-white/35 font-semibold mb-1.5">Connected wallet</p>
            <p className="font-mono text-sm text-white mb-6" title={address}>
              {address && truncate(address)}
            </p>
            <Button
              onClick={check}
              disabled={checking}
              size="lg"
              icon={checking ? <Loader2 className="w-4 h-4 animate-spin" /> : stale ? <RotateCcw className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            >
              {checking ? "Checking…" : stale ? "Re-check this wallet" : result ? "Check again" : "Check eligibility"}
            </Button>
            {error && <p className="text-sm text-danger mt-4">{error}</p>}
            {result && !stale && !error && (
              <p className={clsx("text-sm mt-4 font-medium", result.eligible ? "text-success" : "text-white/50")}>
                {result.eligible
                  ? "You're on the list — see which phases below."
                  : "This wallet isn't on either list right now."}
              </p>
            )}
          </>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {PHASES.map((phase) => (
          <PhaseCard key={phase.key} phase={phase} result={stale ? null : result} />
        ))}
      </div>
    </div>
  );
}
