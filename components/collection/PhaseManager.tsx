"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Settings2 } from "lucide-react";
import { useSession } from "@/hooks/useSession";

type Phase = {
  enabled: boolean;
  priceEth: number;
  allocation: number;
  walletLimit: number;
  allowlist: string[];
  minted: number;
};
type Phases = { whitelist: Phase; og: Phase; public: Phase };

const LABELS: Record<keyof Phases, string> = {
  whitelist: "Whitelist (GTD)",
  og: "OG (GTD)",
  public: "Public (FCFS)",
};

export function PhaseManager({ collectionId, creatorAddress }: { collectionId: string; creatorAddress: string | null }) {
  const { user } = useSession();
  const [phases, setPhases] = useState<Phases | null>(null);
  const [saving, setSaving] = useState<keyof Phases | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = !!user && !!creatorAddress && user.address.toLowerCase() === creatorAddress.toLowerCase();

  useEffect(() => {
    if (!isOwner) return;
    fetch(`/api/collections/${collectionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhases(data.mintPhases));
  }, [isOwner, collectionId]);

  if (!isOwner || !phases) return null;

  async function save(key: keyof Phases, patch: Partial<Phase>) {
    setSaving(key);
    setError(null);
    const optimistic = { ...phases!, [key]: { ...phases![key], ...patch } };
    setPhases(optimistic);
    try {
      const res = await fetch(`/api/collections/${collectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintPhases: { [key]: patch } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update phase");
      setPhases(data.mintPhases);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update phase");
      setPhases(phases); // revert
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="surface-card p-5 mt-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-1">
        <Settings2 className="w-4 h-4 text-purple-300" /> Manage mint phases
      </div>
      <p className="text-xs text-white/45 mb-4">
        Only one phase should usually be live at a time — toggle the next one on and the current one off,
        no need to relaunch the collection.
      </p>
      <div className="space-y-3">
        {(Object.keys(LABELS) as (keyof Phases)[]).map((key) => (
          <PhaseRow key={key} phaseKey={key} label={LABELS[key]} phase={phases[key]} saving={saving === key} onSave={(patch) => save(key, patch)} />
        ))}
      </div>
      {error && <p className="text-xs text-danger mt-3">{error}</p>}
    </div>
  );
}

function PhaseRow({
  phaseKey,
  label,
  phase,
  saving,
  onSave,
}: {
  phaseKey: keyof Phases;
  label: string;
  phase: Phase;
  saving: boolean;
  onSave: (patch: Partial<Phase>) => void;
}) {
  const [draft, setDraft] = useState(phase);
  const [allowlistText, setAllowlistText] = useState(phase.allowlist.join("\n"));
  const fileRef = useRef<HTMLInputElement>(null);
  const hasAllowlist = phaseKey !== "public";

  useEffect(() => {
    const id = setTimeout(() => {
      setDraft(phase);
      setAllowlistText(phase.allowlist.join("\n"));
    }, 0);
    return () => clearTimeout(id);
  }, [phase]);

  function parseAddresses(text: string) {
    return text.split(/[\s,]+/).map((a) => a.trim()).filter(Boolean);
  }

  async function onCsvUpload(file: File) {
    const text = await file.text();
    const addresses = text
      .split(/\r?\n/)
      .map((line) => line.split(",")[0]?.trim())
      .filter((v) => v && /^0x[a-fA-F0-9]{40}$/.test(v));
    const merged = [...new Set([...parseAddresses(allowlistText), ...addresses])];
    setAllowlistText(merged.join("\n"));
  }

  return (
    <div className="rounded-lg border border-white/10 p-3.5 bg-white/[0.02]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-white/85">{label}</div>
          <div className="text-[11px] text-white/40 mt-0.5">
            {phase.minted}/{phase.allocation || "∞"} minted
            {phase.walletLimit > 0 ? ` · ${phase.walletLimit}/wallet` : ""}
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          {saving && <Loader2 className="w-3.5 h-3.5 text-purple-300 animate-spin" />}
          <span className="text-xs text-white/50">{phase.enabled ? "Live" : "Off"}</span>
          <input
            type="checkbox"
            checked={phase.enabled}
            disabled={saving}
            onChange={(e) => onSave({ enabled: e.target.checked })}
            className="accent-purple-500 w-4 h-4"
          />
        </label>
      </div>

      <div className="grid sm:grid-cols-3 gap-2 mt-3">
        <input
          type="number"
          min="0"
          step="0.001"
          value={draft.priceEth}
          onChange={(e) => setDraft((d) => ({ ...d, priceEth: Number(e.target.value) }))}
          placeholder="Price ETH"
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
        />
        <input
          type="number"
          min="0"
          value={draft.allocation || ""}
          onChange={(e) => setDraft((d) => ({ ...d, allocation: Number(e.target.value) }))}
          placeholder="Supply allocation"
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
        />
        <input
          type="number"
          min="0"
          value={draft.walletLimit || ""}
          onChange={(e) => setDraft((d) => ({ ...d, walletLimit: Number(e.target.value) }))}
          placeholder="0 = no wallet cap"
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
        />
      </div>

      {hasAllowlist && (
        <div className="mt-2">
          <textarea
            value={allowlistText}
            onChange={(e) => setAllowlistText(e.target.value)}
            placeholder="Wallet addresses, comma or line separated"
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder:text-white/30"
          />
          <div className="flex items-center justify-between mt-1.5">
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-[11px] text-purple-300 hover:text-purple-200"
            >
              <Upload className="w-3 h-3" /> Upload CSV
            </button>
            <span className="text-[11px] text-white/35">{parseAddresses(allowlistText).length} wallets</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onCsvUpload(e.target.files[0])}
          />
        </div>
      )}

      <button
        onClick={() =>
          onSave({
            priceEth: draft.priceEth,
            allocation: draft.allocation,
            walletLimit: draft.walletLimit,
            allowlist: hasAllowlist ? parseAddresses(allowlistText) : undefined,
          })
        }
        disabled={saving}
        className="mt-2.5 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
      >
        Save changes
      </button>
    </div>
  );
}
