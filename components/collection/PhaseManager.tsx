"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Settings2 } from "lucide-react";
import clsx from "clsx";
import { useSession } from "@/hooks/useSession";
import { PHASE_LABELS, PhaseKey } from "@/lib/mintPhases";

type Phase = {
  enabled: boolean;
  priceEth: number;
  allocation: number;
  walletLimit: number;
  // Public has no allowlist in the schema, so this is genuinely absent
  // for that phase rather than an empty array.
  allowlist?: string[];
  minted: number;
  startsAt: string | null;
  endsAt: string | null;
};
type Phases = Record<PhaseKey, Phase>;

function toLocalInputValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
function fromLocalInputValue(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function PhaseManager({ collectionId, creatorAddress }: { collectionId: string; creatorAddress: string | null }) {
  const { user } = useSession();
  const [phases, setPhases] = useState<Phases | null>(null);
  const [saving, setSaving] = useState<PhaseKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = !!user && !!creatorAddress && user.address.toLowerCase() === creatorAddress.toLowerCase();

  useEffect(() => {
    if (!isOwner) return;
    fetch(`/api/collections/${collectionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhases(data.mintPhases));
  }, [isOwner, collectionId]);

  if (!isOwner || !phases) return null;

  async function save(key: PhaseKey, patch: Partial<Phase>) {
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
        GTD, FCFS and Public can all be live at once — toggle any of them on or off independently, or set an
        end time to have one close on its own. A wallet eligible for more than one live phase picks which to
        mint through; otherwise they can only mint via Public if it&rsquo;s live.
      </p>
      <div className="space-y-3">
        {(Object.keys(PHASE_LABELS) as PhaseKey[]).map((key) => (
          <PhaseRow key={key} phaseKey={key} label={PHASE_LABELS[key]} phase={phases[key]} saving={saving === key} onSave={(patch) => save(key, patch)} />
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
  phaseKey: PhaseKey;
  label: string;
  phase: Phase;
  saving: boolean;
  onSave: (patch: Partial<Phase>) => void;
}) {
  const [draft, setDraft] = useState(phase);
  const [allowlistText, setAllowlistText] = useState((phase.allowlist ?? []).join("\n"));
  const fileRef = useRef<HTMLInputElement>(null);
  const isPublic = phaseKey === "public";
  const hasAllowlist = !isPublic;
  const isGtd = phaseKey === "whitelist";

  useEffect(() => {
    const id = setTimeout(() => {
      setDraft(phase);
      setAllowlistText((phase.allowlist ?? []).join("\n"));
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
            {!isPublic && phase.walletLimit > 0 ? ` · ${phase.walletLimit}/wallet` : ""}
            {isGtd
              ? " · guaranteed for allowlisted wallets"
              : isPublic
                ? " · open to everyone, no wallet cap"
                : " · first come, first served — closes automatically once sold out"}
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

      <div className={clsx("grid gap-2 mt-3", isPublic ? "grid-cols-1" : "sm:grid-cols-3")}>
        <input
          type="number"
          min="0"
          step="0.001"
          value={draft.priceEth}
          onChange={(e) => setDraft((d) => ({ ...d, priceEth: Number(e.target.value) }))}
          placeholder="Price ETH"
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
        />
        {!isPublic && (
          <>
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
          </>
        )}
      </div>

      {isPublic ? (
        <p className="text-[10px] text-white/30 mt-2">
          Supply is whatever&rsquo;s left of the collection&rsquo;s max supply after GTD + FCFS reserve
          theirs — no allocation, wallet cap, or schedule to set here. Set the collection&rsquo;s max supply
          to cap it, or leave it unlimited.
        </p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-2 mt-2">
            <div>
              <label className="text-[10px] text-white/35 block mb-1">Starts (optional)</label>
              <input
                type="datetime-local"
                value={toLocalInputValue(draft.startsAt)}
                onChange={(e) => setDraft((d) => ({ ...d, startsAt: fromLocalInputValue(e.target.value) }))}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-white/35 block mb-1">Ends (optional)</label>
              <input
                type="datetime-local"
                value={toLocalInputValue(draft.endsAt)}
                onChange={(e) => setDraft((d) => ({ ...d, endsAt: fromLocalInputValue(e.target.value) }))}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
              />
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-1">
            Leave blank to control manually with the Live/Off toggle above. Set an end time to have this phase
            close itself automatically — independent of any other phase.
          </p>

          <label className="flex items-center gap-1.5 mt-2 text-[11px] text-white/50 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={draft.walletLimit === 1}
              onChange={(e) => setDraft((d) => ({ ...d, walletLimit: e.target.checked ? 1 : 0 }))}
              className="accent-purple-500 w-3.5 h-3.5"
            />
            Limit to 1 mint per wallet
          </label>
        </>
      )}

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
          onSave(
            isPublic
              ? { priceEth: draft.priceEth }
              : {
                  priceEth: draft.priceEth,
                  allocation: draft.allocation,
                  walletLimit: draft.walletLimit,
                  startsAt: draft.startsAt,
                  endsAt: draft.endsAt,
                  allowlist: parseAddresses(allowlistText),
                }
          )
        }
        disabled={saving}
        className="mt-2.5 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
      >
        Save changes
      </button>
    </div>
  );
}
