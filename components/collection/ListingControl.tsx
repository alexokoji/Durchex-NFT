"use client";

import { useEffect, useState } from "react";
import { Loader2, Tags, Lock } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { CountdownTimer } from "@/components/nft/CountdownTimer";
import { listingGate } from "@/lib/listing";

function toLocalInputValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
function fromLocalInputValue(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

type State = {
  listingEnabled: boolean;
  listingOpensAt: string | null;
  mintedOut: boolean;
  mintedSupply: number;
  unmintedCount: number;
  maxSupply: number;
};

/**
 * Creator control for opening resale.
 *
 * Resale stays locked until the collection is fully minted out — running it
 * alongside the primary mint means the collection competes with itself. The
 * server enforces that; this shows the creator where they are against it,
 * rather than presenting a control that silently refuses.
 */
export function ListingControl({ collectionId, creatorAddress }: { collectionId: string; creatorAddress: string | null }) {
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
      setState((s) => (s ? { ...s, ...data } : s));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update listing");
    } finally {
      setSaving(false);
    }
  }

  const gate = listingGate({
    maxSupply: state.maxSupply,
    mintedSupply: state.mintedSupply,
    unmintedCount: state.unmintedCount,
    listingEnabled: state.listingEnabled,
    listingOpensAt: state.listingOpensAt,
  });

  const remaining =
    state.maxSupply > 0 ? Math.max(0, state.maxSupply - state.mintedSupply) : state.unmintedCount;

  return (
    <div className="surface-card p-5 mt-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-1">
        <Tags className="w-4 h-4 text-purple-300" /> Resale listing
      </div>

      {!gate.mintedOut ? (
        <>
          <p className="text-xs text-white/45 mb-3">
            Owners can list their items for resale once this collection is fully minted. Keeping resale
            closed until then stops it competing with your own mint.
          </p>
          <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <Lock className="w-4 h-4 shrink-0 mt-0.5 text-white/30" />
            <div className="text-xs text-white/60">
              <span className="text-white/80 font-medium">
                {remaining} still to mint
              </span>
              {state.maxSupply > 0 && (
                <span className="text-white/35">
                  {" "}
                  · {state.mintedSupply} of {state.maxSupply} minted
                </span>
              )}
              <p className="text-white/35 mt-1">
                This unlocks by itself — nothing to do here until it does.
              </p>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-white/45 mb-3">
            Fully minted. Open resale now, or schedule it — owners can list from whichever comes first.
          </p>

          <label className="flex items-center gap-2 cursor-pointer w-fit">
            {saving && <Loader2 className="w-3.5 h-3.5 text-purple-300 animate-spin" />}
            <span className="text-xs text-white/50">{gate.open ? "Resale open" : "Resale closed"}</span>
            <input
              type="checkbox"
              checked={state.listingEnabled}
              disabled={saving}
              onChange={(e) => save({ enabled: e.target.checked })}
              className="accent-purple-500 w-4 h-4"
            />
          </label>

          <div className="mt-3">
            <label className="text-[10px] text-white/35 block mb-1">Open automatically at (optional)</label>
            <input
              type="datetime-local"
              defaultValue={toLocalInputValue(state.listingOpensAt)}
              disabled={saving}
              onBlur={(e) => save({ opensAt: fromLocalInputValue(e.target.value) })}
              className="w-full max-w-xs bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
            />
            <p className="text-[10px] text-white/30 mt-1">
              Resale opens at this time even if the toggle above is off. Leave blank to control it manually.
            </p>
          </div>

          {gate.opensAt && (
            <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
              <span>Opens in</span>
              <CountdownTimer endsAt={gate.opensAt} compact />
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs text-danger mt-3">{error}</p>}
    </div>
  );
}
