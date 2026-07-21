"use client";

import { useEffect, useState } from "react";
import { Plus, BadgeCheck, Loader2 } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { CategoryIcon, CATEGORY_LABELS, CategoryKey } from "@/components/ui/CategoryIcon";
import { GeneratedArt } from "@/components/nft/GeneratedArt";

export interface CollectionOption {
  id: string;
  slug: string;
  name: string;
  category: CategoryKey;
  contractAddress: string;
  chainId: number;
  royaltyBps: number;
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
  const [form, setForm] = useState({ name: "", category: "art" as CategoryKey, royaltyBps: 500 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/collections")
      .then((r) => r.json())
      .then((data) => setCollections(data.collections));
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
        body: JSON.stringify(form),
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
            <span className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
              <GeneratedArt seedKey={`logo-${c.slug}`} className="w-full h-full" />
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
          <span className="text-sm font-medium text-white/70">New collection</span>
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
              max={1000}
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
