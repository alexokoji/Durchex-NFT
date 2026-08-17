"use client";

import { useEffect, useState } from "react";
import { Loader2, Tags } from "lucide-react";
import { useSession } from "@/hooks/useSession";

function toLocalInputValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
function fromLocalInputValue(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function ListingControl({ collectionId, creatorAddress }: { collectionId: string; creatorAddress: string | null }) {
  const { user } = useSession();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [opensAt, setOpensAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = !!user && !!creatorAddress && user.address.toLowerCase() === creatorAddress.toLowerCase();

  useEffect(() => {
    if (!isOwner) return;
    fetch(`/api/collections/${collectionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setEnabled(data.listingEnabled);
        setOpensAt(data.listingOpensAt);
      });
  }, [isOwner, collectionId]);

  if (!isOwner || enabled === null) return null;

  async function save(patch: { enabled?: boolean; opensAt?: string | null }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${collectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing: patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update listing");
      setEnabled(data.listingEnabled);
      setOpensAt(data.listingOpensAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update listing");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surface-card p-5 mt-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-1">
        <Tags className="w-4 h-4 text-purple-300" /> Resale listing
      </div>
      <p className="text-xs text-white/45 mb-4">
        Controls whether owners can list their items from this collection for resale. Doesn&rsquo;t affect
        minting or your own initial listing on /create.
      </p>

      <label className="flex items-center gap-2 cursor-pointer w-fit">
        {saving && <Loader2 className="w-3.5 h-3.5 text-purple-300 animate-spin" />}
        <span className="text-xs text-white/50">{enabled ? "Listing open" : "Listing closed"}</span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(e) => save({ enabled: e.target.checked })}
          className="accent-purple-500 w-4 h-4"
        />
      </label>

      <div className="mt-3">
        <label className="text-[10px] text-white/35 block mb-1">Auto-open at (optional)</label>
        <input
          type="datetime-local"
          defaultValue={toLocalInputValue(opensAt)}
          disabled={saving}
          onBlur={(e) => save({ opensAt: fromLocalInputValue(e.target.value) })}
          className="w-full max-w-xs bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
        />
        <p className="text-[10px] text-white/30 mt-1">
          Listing opens automatically at this time even if the toggle above is off. Leave blank to control
          manually with the toggle only.
        </p>
      </div>
      {error && <p className="text-xs text-danger mt-3">{error}</p>}
    </div>
  );
}
