import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { WalletCheckerPanel } from "@/components/wallet/WalletCheckerPanel";

export const metadata: Metadata = {
  title: "Wallet Checker · Durchex",
  description: "Connect your wallet to check whether you're eligible for the GTD or FCFS mint phase.",
};

export default function WalletCheckerPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="text-center mb-10">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-200 text-xs font-semibold mb-4">
          <ListChecks className="w-3.5 h-3.5" />
          Allowlist
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-3">Wallet Checker</h1>
        <p className="text-white/50 text-sm max-w-lg mx-auto">
          Connect your wallet and check it against the allowlists in one click. We&apos;ll tell you straight away
          whether you&apos;re in for the GTD phase, the FCFS phase, or neither.
        </p>
      </div>

      <WalletCheckerPanel />

      <p className="text-xs text-white/30 text-center mt-10">
        Lists are published by the Durchex team and can change before a drop goes live — check back if yours was
        submitted recently.
      </p>
    </div>
  );
}
