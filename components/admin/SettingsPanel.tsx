"use client";

import { useEffect, useState } from "react";
import { Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function SettingsPanel() {
  const [royaltyCapBps, setRoyaltyCapBps] = useState<number | null>(null);
  const [platformFeeBps, setPlatformFeeBps] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        setRoyaltyCapBps(data.royaltyCapBps);
        setPlatformFeeBps(data.platformFeeBps);
      });
  }, []);

  async function save() {
    if (royaltyCapBps === null) return;
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ royaltyCapBps }),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
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
            <label className="text-sm font-medium text-white mb-1.5 block">Creator royalty cap</label>
            <p className="text-xs text-white/45 mb-3">The maximum royalty percentage a creator can set on a new or existing collection.</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                max="50"
                value={(royaltyCapBps / 100).toFixed(1)}
                onChange={(e) => setRoyaltyCapBps(Math.round(Number(e.target.value) * 100))}
                className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/60"
              />
              <span className="text-sm text-white/50">%</span>
            </div>
          </div>

          <div className="surface-card p-5">
            <label className="text-sm font-medium text-white mb-1.5 block">Platform fee</label>
            <div className="flex items-start gap-2 text-xs text-amber-100 bg-amber-400/10 border border-amber-300/20 rounded-lg p-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Currently {((platformFeeBps ?? 0) / 100).toFixed(1)}%, fixed as a constant in the deployed
                DurchexMarketplace contract. Changing it requires redeploying the marketplace contract and
                re-wiring it as trusted on DurchexNFT — not editable here.
              </span>
            </div>
          </div>

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
          </div>
        </div>
      )}
    </div>
  );
}
