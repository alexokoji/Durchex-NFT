"use client";

import { useEffect, useState } from "react";
import { Loader2, Info, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ReconcilePanel } from "@/components/admin/ReconcilePanel";

export function SettingsPanel() {
  type OnChain = {
    platformFeeBps: number;
    maxPlatformFeeBps: number;
    paused: boolean;
    marketplaceAddress: string;
    chainId: number;
  };
  const [royaltyCapBps, setRoyaltyCapBps] = useState<number | null>(null);
  const [contractMaxRoyaltyBps, setContractMaxRoyaltyBps] = useState(3000);
  const [onChain, setOnChain] = useState<OnChain | null>(null);
  const [creationEnabled, setCreationEnabled] = useState(true);
  const [creationAllowlist, setCreationAllowlist] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        setRoyaltyCapBps(data.royaltyCapBps);
        if (data.contractMaxRoyaltyBps) setContractMaxRoyaltyBps(data.contractMaxRoyaltyBps);
        setOnChain(data.onChain ?? null);
        setCreationEnabled(data.creationEnabled !== false);
        setCreationAllowlist((data.creationAllowlist ?? []).join("\n"));
      });
  }, []);

  async function save() {
    if (royaltyCapBps === null) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ royaltyCapBps, creationEnabled, creationAllowlist }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setCreationAllowlist((data.creationAllowlist ?? []).join("\n"));
    } else {
      setError(data.error ?? "Couldn't save settings.");
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <h1 className="font-display text-2xl font-semibold text-white mb-1">Platform settings</h1>
      <p className="text-sm text-white/45 mb-6">Controls that apply marketplace-wide.</p>

      {royaltyCapBps === null ? (
        <Loader2 className="w-5 h-5 animate-spin text-white/40" />
      ) : (
        <div className="space-y-6">
          <div className="surface-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <label className="text-sm font-medium text-white mb-1.5 flex items-center gap-2">
                  {creationEnabled ? (
                    <Unlock className="w-4 h-4 text-purple-300" />
                  ) : (
                    <Lock className="w-4 h-4 text-danger" />
                  )}
                  Public creation
                </label>
                <p className="text-xs text-white/45">
                  {creationEnabled
                    ? "Any signed-in wallet can create collections and NFTs."
                    : "Creation is closed. Only the wallets listed below can create collections or NFTs — everyone else is turned away at the API, not just in the UI."}
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer shrink-0 pt-0.5">
                <span className="text-xs text-white/50">{creationEnabled ? "Open" : "Closed"}</span>
                <input
                  type="checkbox"
                  checked={creationEnabled}
                  onChange={(e) => setCreationEnabled(e.target.checked)}
                  className="accent-purple-500 w-4 h-4"
                />
              </label>
            </div>

            {!creationEnabled && (
              <div className="mt-4">
                <label className="text-[11px] uppercase tracking-wide text-white/40 block mb-1.5">
                  Wallets still allowed to create
                </label>
                <textarea
                  value={creationAllowlist}
                  onChange={(e) => setCreationAllowlist(e.target.value)}
                  rows={4}
                  spellCheck={false}
                  placeholder="0x… one address per line"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500/60"
                />
                <p className="text-[11px] text-white/30 mt-1.5">
                  One address per line. Leave empty to close creation to everyone including yourself.
                </p>
              </div>
            )}
          </div>

          <div className="surface-card p-5">
            <label className="text-sm font-medium text-white mb-1.5 block">Creator royalty cap</label>
            <p className="text-xs text-white/45 mb-3">
              The maximum royalty percentage a creator can set. The contract independently rejects anything above{" "}
              {(contractMaxRoyaltyBps / 100).toFixed(0)}%, so this can only tighten that limit, never exceed it.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                max={contractMaxRoyaltyBps / 100}
                value={(royaltyCapBps / 100).toFixed(1)}
                onChange={(e) => setRoyaltyCapBps(Math.round(Number(e.target.value) * 100))}
                className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/60"
              />
              <span className="text-sm text-white/50">%</span>
            </div>
          </div>

          <div className="surface-card p-5">
            <label className="text-sm font-medium text-white mb-1.5 block">Platform fee (on-chain)</label>
            {onChain ? (
              <>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="font-display text-2xl font-semibold text-white tabular-nums">
                    {(onChain.platformFeeBps / 100).toFixed(1)}%
                  </span>
                  <span className="text-xs text-white/40">
                    ceiling {(onChain.maxPlatformFeeBps / 100).toFixed(0)}%
                  </span>
                  {onChain.paused && (
                    <span className="text-xs rounded-full px-2 py-0.5 border border-danger/40 bg-danger/10 text-danger">
                      Trading paused
                    </span>
                  )}
                </div>
                <div className="flex items-start gap-2 text-xs text-white/50 bg-white/5 border border-white/10 rounded-lg p-3">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-purple-300" />
                  <span>
                    Read live from the marketplace contract. Adjustable by the contract owner between 0% and the
                    immutable {(onChain.maxPlatformFeeBps / 100).toFixed(0)}% ceiling by calling{" "}
                    <code className="text-purple-200">setPlatformFee</code> — no redeploy needed. Changing it
                    requires the owner wallet, so it isn&rsquo;t editable from this panel.
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs text-white/40">Couldn&rsquo;t read the marketplace contract right now.</p>
            )}
          </div>

          <ReconcilePanel />

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
            {saved && <span className="text-xs text-purple-300">Saved.</span>}
            {error && <span className="text-xs text-danger">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
