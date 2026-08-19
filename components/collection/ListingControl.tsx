"use client";

import { useEffect, useState } from "react";
import { Loader2, Tags, Lock } from "lucide-react";
import { useSession } from "@/hooks/useSession";

type State = {
  listingEnabled: boolean;
  mintedOut: boolean;
  mintedSupply: number;
  totalUnits: number;
  maxSupply: number;
};

/**
 * Creator control for opening resale early.
 *
 * Creator-only, and it disappears entirely once the collection mints out —
 * at that point resale is permanently open and there is nothing here to
 * decide. Being explicit about that in this panel is fine; it is the
 * public-facing copy that stays neutral, so buyers never read the
 * secondary market as something a creator could switch off on them.
 */
export function ListingControl({
  collectionId,
  creatorAddress,
}: {
  collectionId: string;
  creatorAddress: string | null;
}) {
  const { user } = useSession();
  const [state, setState] = useState<State | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = !!user && !!creatorAddress && user.address.toLowerCase() === creatorAddress.toLowerCase();

  useEffect(() => {
    if (!isOwner) return;
    fetch(`/api/collections/${collectionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setState(data));
  }, [isOwner, collectionId]);

  if (!isOwner || !state) return null;

  async function save(enabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${collectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing: { enabled } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update resale");
      setState((s) => (s ? { ...s, ...data } : s));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update resale");
    } finally {
      setSaving(false);
    }
  }

  const remaining =
    state.maxSupply > 0
      ? Math.max(0, state.maxSupply - state.mintedSupply)
      : Math.max(0, state.totalUnits - state.mintedSupply);

  return (
    <div className="surface-card p-5 mt-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-1">
        <Tags className="w-4 h-4 text-purple-300" /> Resale
      </div>

      {state.mintedOut ? (
        <>
          <p className="text-xs text-white/45 mb-3">
            This collection is fully minted, so resale is open permanently. You continue to earn your
            royalty on every sale.
          </p>
          <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <Lock className="w-4 h-4 shrink-0 mt-0.5 text-white/30" />
            <div className="text-xs text-white/60">
              <span className="text-white/80 font-medium">Resale is open for good</span>
              <p className="text-white/35 mt-1">
                Holders own what they bought — closing the secondary market on them isn&rsquo;t
                something anyone can do.
              </p>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-white/45 mb-3">
            Your mint is still running. You can open resale now if you want a live secondary market
            alongside it — otherwise it opens on its own the moment the collection mints out.
          </p>

          <label className="flex items-center gap-2 cursor-pointer w-fit">
            {saving && <Loader2 className="w-3.5 h-3.5 text-purple-300 animate-spin" />}
            <span className="text-xs text-white/50">
              {state.listingEnabled ? "Resale open" : "Resale closed"}
            </span>
            <input
              type="checkbox"
              checked={state.listingEnabled}
              disabled={saving}
              onChange={(e) => save(e.target.checked)}
              className="accent-purple-500 w-4 h-4"
            />
          </label>

          <p className="text-[10px] text-white/30 mt-3">
            {remaining.toLocaleString()} still to mint. Once that reaches zero this switch is retired
            and resale stays open.
          </p>
        </>
      )}

      {error && <p className="text-xs text-danger mt-3">{error}</p>}
    </div>
  );
}
