"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { useSession } from "@/hooks/useSession";

/**
 * Creator-only deletion.
 *
 * Only offered while nothing has been minted — once a token exists on-chain
 * the chain is the record, and removing our side of it would leave real
 * holders pointing at a collection that no longer exists. The server
 * enforces that too; this just avoids offering a button that would refuse.
 */
export function DeleteCollection({
  collectionId,
  collectionName,
  creatorAddress,
  mintedSupply,
}: {
  collectionId: string;
  collectionName: string;
  creatorAddress: string | null;
  mintedSupply: number;
}) {
  const { user } = useSession();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = !!user && !!creatorAddress && user.address.toLowerCase() === creatorAddress.toLowerCase();
  if (!isOwner) return null;

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${collectionId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete collection");
      router.push("/creator");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete collection");
      setDeleting(false);
    }
  }

  return (
    <div className="surface-card p-5 mt-6 border-danger/20">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-1">
        <Trash2 className="w-4 h-4 text-danger" /> Delete collection
      </div>

      {mintedSupply > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 mt-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-white/30" />
          <div className="text-xs text-white/60">
            <span className="text-white/80 font-medium">
              {mintedSupply === 1 ? "1 item is" : `${mintedSupply} items are`} already minted on-chain
            </span>
            <p className="text-white/35 mt-1">
              Those tokens exist independently of Durchex and belong to their holders, so this
              collection can no longer be deleted. You can close resale instead.
            </p>
          </div>
        </div>
      ) : !confirming ? (
        <>
          <p className="text-xs text-white/45 mb-3">
            Nothing has been minted yet, so this collection and its unminted items can be removed
            permanently. This can&rsquo;t be undone.
          </p>
          <button
            onClick={() => setConfirming(true)}
            className="text-xs px-3 py-1.5 rounded-lg border border-danger/40 text-danger hover:bg-danger/10 transition"
          >
            Delete this collection
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-white/60 mb-3">
            Type <span className="text-white font-medium">{collectionName}</span> to confirm. Every
            unminted item, offer and bid in it goes too.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={collectionName}
            disabled={deleting}
            className="w-full max-w-xs bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white mb-3"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={remove}
              disabled={deleting || typed.trim() !== collectionName}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-danger/15 border border-danger/40 text-danger disabled:opacity-40 disabled:cursor-not-allowed hover:bg-danger/25 transition"
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Delete permanently
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                setTyped("");
              }}
              disabled={deleting}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:bg-white/5 transition"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {error && <p className="text-xs text-danger mt-3">{error}</p>}
    </div>
  );
}
