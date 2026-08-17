"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, BadgeCheck, Loader2, Upload } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { CategoryIcon, CATEGORY_LABELS, CategoryKey } from "@/components/ui/CategoryIcon";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { AssetUploader, UploadedAsset } from "@/components/create/AssetUploader";
import { PHASE_LABELS, PHASE_KEYS, PhaseKey } from "@/lib/mintPhases";

type CreatePhaseForm = {
  enabled: boolean;
  priceEth: number;
  allocation: number;
  walletLimit: number;
  allowlist: string;
  startsAt: string;
  endsAt: string;
};

export interface CollectionOption {
  id: string;
  slug: string;
  name: string;
  category: CategoryKey;
  contractAddress: string;
  chainId: number;
  royaltyBps: number;
  logoUrl?: string;
  bannerUrl?: string;
  verified: boolean;
  items: number;
}

export function CollectionPicker({
  selected,
  onSelect,
}: {
  selected: CollectionOption | null;
  onSelect: (c: CollectionOption) => void;
}) {
  const [collections, setCollections] = useState<CollectionOption[] | null>(null);
  const [creating, setCreating] = useState(false);
  const emptyPhase: CreatePhaseForm = { enabled: false, priceEth: 0, allocation: 0, walletLimit: 0, allowlist: "", startsAt: "", endsAt: "" };
  const [form, setForm] = useState({ name: "", category: "art" as CategoryKey, royaltyBps: 500, maxSupply: 0, payoutAddress: "", logo: null as UploadedAsset | null, banner: null as UploadedAsset | null, mintPhases: {
    whitelist: { ...emptyPhase },
    og: { ...emptyPhase },
    public: { ...emptyPhase },
  } as Record<PhaseKey, CreatePhaseForm> });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/collections?mine=1")
      .then((r) => r.ok ? r.json() : { collections: [] })
      .then((data) => setCollections(data.collections ?? []));
  }, []);

  async function createCollection() {
    if (form.name.trim().length < 2) {
      setError("Give your collection a name (2+ characters).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, logoUrl: form.logo?.url ?? "", bannerUrl: form.banner?.url ?? "", payoutRecipients: form.payoutAddress.trim() ? [{ address: form.payoutAddress.trim(), shareBps: 10000 }] : [], mintPhases: {
          whitelist: { ...form.mintPhases.whitelist, allowlist: form.mintPhases.whitelist.allowlist.split(/[\s,]+/).filter(Boolean) },
          og: { ...form.mintPhases.og, allowlist: form.mintPhases.og.allowlist.split(/[\s,]+/).filter(Boolean) },
          public: form.mintPhases.public,
        } }),
        // Note: startsAt/endsAt are plain <input type="datetime-local"> strings
        // here (local time, no timezone) — the server's Date constructor
        // parses them as local time too, matching PhaseManager's approach.
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create collection");
      const created: CollectionOption = { ...data, items: 0 };
      setCollections((prev) => [...(prev ?? []), created]);
      onSelect(created);
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create collection");
    } finally {
      setSubmitting(false);
    }
  }

  if (collections === null) {
    return (
      <div className="flex items-center justify-center py-12 text-white/40">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-white">Your collections</div>
          <p className="text-[11px] text-white/40 mt-0.5">Only collections created by your connected wallet appear here.</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        {collections.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className={clsx(
              "surface-card p-3.5 flex items-center gap-3 text-left transition",
              selected?.id === c.id
                ? "border-purple-500/60 ring-1 ring-purple-500/40"
                : "hover:border-white/20"
            )}
          >
            <span className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-black">
              {c.logoUrl ? <img src={c.logoUrl} alt="" className="w-full h-full object-cover" /> : <GeneratedArt seedKey={`logo-${c.slug}`} className="w-full h-full" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium text-white truncate">{c.name}</span>
                {c.verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
              </div>
              <div className="text-[11px] text-white/40">{CATEGORY_LABELS[c.category]}</div>
            </div>
          </button>
        ))}

        <button
          onClick={() => setCreating(true)}
          className="surface-card p-3.5 flex items-center gap-3 text-left border-dashed border-white/15 hover:border-purple-500/40 transition"
        >
          <span className="w-10 h-10 rounded-lg grid place-items-center bg-white/5 shrink-0">
            <Plus className="w-4 h-4 text-purple-400" />
          </span>
          <span className="text-sm font-medium text-white/70">Create your collection</span>
        </button>
      </div>

      {creating && (
        <div className="surface-card p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-white/50 mb-1.5 block">Collection name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Neon Ronin"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-white/50 mb-1.5 block">Collection image</label>
              <AssetUploader value={form.logo} onChange={(logo) => setForm((current) => ({ ...current, logo }))} imageOnly label="Upload collection image" />
            </div>
            <div>
              <label className="text-xs font-medium text-white/50 mb-1.5 block">Collection cover image</label>
              <AssetUploader value={form.banner} onChange={(banner) => setForm((current) => ({ ...current, banner }))} imageOnly label="Upload cover image" />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-white/50 mb-1.5 block">Collection supply</label>
              <input type="number" min="0" value={form.maxSupply || ""} onChange={(e) => setForm((current) => ({ ...current, maxSupply: Number(e.target.value) }))} placeholder="0 = unlimited" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60" />
              <p className="text-[10px] text-white/30 mt-1">Leave blank for no contract-level cap.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-white/50 mb-1.5 block">Primary sale recipient</label>
              <input value={form.payoutAddress} onChange={(e) => setForm((current) => ({ ...current, payoutAddress: e.target.value }))} placeholder="0x… (defaults to creator)" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60" />
              <p className="text-[10px] text-white/30 mt-1">Receives drop mint proceeds on deployment.</p>
            </div>
          </div>

          <div className="pt-1">
            <div className="text-xs font-medium text-white/50 mb-2">Optional mint phases</div>
            <p className="text-[11px] text-white/35 mb-3">
              Configure your launch now — enforced immediately once enabled. You can toggle phases on/off
              later from the collection page (e.g. close GTD and open FCFS) without recreating anything.
            </p>
            <div className="space-y-2">
              {PHASE_KEYS.map((phase) => (
                <CreatePhaseRow
                  key={phase}
                  phaseKey={phase}
                  config={form.mintPhases[phase]}
                  onChange={(patch) =>
                    setForm((current) => ({
                      ...current,
                      mintPhases: { ...current.mintPhases, [phase]: { ...current.mintPhases[phase], ...patch } },
                    }))
                  }
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-white/50 mb-1.5 block">Category</label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setForm((f) => ({ ...f, category: cat }))}
                  className={clsx(
                    "flex flex-col items-center gap-1 py-2.5 rounded-lg border text-[11px]",
                    form.category === cat
                      ? "border-purple-500/60 bg-purple-700/15 text-white"
                      : "border-white/10 text-white/50 hover:border-white/20"
                  )}
                >
                  <CategoryIcon category={cat} size={22} />
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-white/50 mb-1.5 block">
              Royalty on resale: {(form.royaltyBps / 100).toFixed(1)}%
            </label>
            <input
              type="range"
              min={0}
              max={3000}
              step={50}
              value={form.royaltyBps}
              onChange={(e) => setForm((f) => ({ ...f, royaltyBps: Number(e.target.value) }))}
              className="w-full accent-purple-600"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button size="sm" onClick={createCollection} disabled={submitting}>
              {submitting ? "Creating…" : "Create collection"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreatePhaseRow({
  phaseKey,
  config,
  onChange,
}: {
  phaseKey: PhaseKey;
  config: CreatePhaseForm;
  onChange: (patch: Partial<CreatePhaseForm>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const hasAllowlist = phaseKey !== "public";
  const isGtd = phaseKey === "whitelist";
  const wallets = config.allowlist.split(/[\s,]+/).map((a) => a.trim()).filter(Boolean);

  async function onCsvUpload(file: File) {
    const text = await file.text();
    const addresses = text
      .split(/\r?\n/)
      .map((line) => line.split(",")[0]?.trim())
      .filter((v) => v && /^0x[a-fA-F0-9]{40}$/.test(v));
    const merged = [...new Set([...wallets, ...addresses])];
    onChange({ allowlist: merged.join("\n") });
  }

  return (
    <div className="rounded-lg border border-white/10 p-3 bg-white/[0.02]">
      <label className="flex items-center justify-between text-sm font-medium text-white/75 cursor-pointer">
        <span>{PHASE_LABELS[phaseKey]}</span>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="accent-purple-500"
        />
      </label>
      {config.enabled && (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] text-white/35">
            {isGtd
              ? "Guaranteed — every allowlisted wallet can mint any time the phase is live."
              : "First come, first served — closes automatically once the allocation sells out."}
          </p>
          <div className="grid sm:grid-cols-3 gap-2">
            <input
              type="number"
              min="0"
              step="0.001"
              value={config.priceEth}
              onChange={(e) => onChange({ priceEth: Number(e.target.value) })}
              placeholder="Price ETH"
              className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
            />
            <input
              type="number"
              min="1"
              value={config.allocation || ""}
              onChange={(e) => onChange({ allocation: Number(e.target.value) })}
              placeholder="Supply allocation"
              className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
            />
            <input
              type="number"
              min="0"
              value={config.walletLimit || ""}
              onChange={(e) => onChange({ walletLimit: Number(e.target.value) })}
              placeholder="0 = no wallet cap"
              className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-white/35 block mb-1">Starts (optional)</label>
              <input
                type="datetime-local"
                value={config.startsAt}
                onChange={(e) => onChange({ startsAt: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-white/35 block mb-1">Ends (optional)</label>
              <input
                type="datetime-local"
                value={config.endsAt}
                onChange={(e) => onChange({ endsAt: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          {hasAllowlist && (
            <div>
              <textarea
                value={config.allowlist}
                onChange={(e) => onChange({ allowlist: e.target.value })}
                placeholder="Wallet addresses, comma or line separated"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder:text-white/30"
              />
              <div className="flex items-center justify-between mt-1.5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 text-[11px] text-purple-300 hover:text-purple-200"
                >
                  <Upload className="w-3 h-3" /> Upload CSV
                </button>
                <span className="text-[11px] text-white/35">{wallets.length} wallets</span>
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
        </div>
      )}
    </div>
  );
}
