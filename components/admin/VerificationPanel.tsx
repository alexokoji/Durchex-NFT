"use client";

import { useEffect, useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { TIER_LABELS } from "@/lib/verification";

type Request = {
  _id: string;
  tier: "white" | "purple";
  status: "pending" | "approved" | "rejected";
  nftsCreated: number;
  reviewNote: string;
  createdAt: string;
  submitted: {
    username?: string;
    bio?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    socials?: { twitter?: string; discord?: string; website?: string; instagram?: string };
    idDocumentUrl?: string;
  };
  user: { _id: string; address: string; username: string; verificationTier: string } | null;
};

/**
 * The verification review queue.
 *
 * Everything the applicant submitted is shown inline — a reviewer deciding
 * whether to vouch for someone's identity shouldn't have to open four tabs
 * to see what they're vouching for.
 */
export function AdminVerificationPanel() {
  const [rows, setRows] = useState<Request[]>([]);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function load(status: "pending" | "all") {
    setLoading(true);
    const res = await fetch(`/api/admin/verification?status=${status}`);
    const data = await res.json();
    setRows(data.requests ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount, not a render loop
    load("pending");
  }, []);

  async function decide(row: Request, decision: "approved" | "rejected") {
    setBusy(row._id);
    setError(null);
    const res = await fetch(`/api/admin/verification/${row._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: notes[row._id] ?? "" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) {
      load(filter);
    } else {
      setError(data.error ?? "Couldn't record that decision.");
    }
  }

  return (
    <div className="px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white mb-1">Verification</h1>
          <p className="text-sm text-white/45">
            Applications for the creator and identity badges.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/10 p-1">
          {(["pending", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                load(f);
              }}
              className={`px-3 py-1 text-xs rounded-md transition ${
                filter === f ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"
              }`}
            >
              {f === "pending" ? "Pending" : "All"}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-danger mb-4">{error}</p>}

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-white/40" />
      ) : rows.length === 0 ? (
        <div className="surface-card p-8 text-center text-sm text-white/40">
          {filter === "pending" ? "Nothing waiting on review." : "No applications yet."}
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row._id} className="surface-card p-5">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 border border-white/10 bg-white/5">
                  {row.submitted.avatarUrl && (
                    <img src={row.submitted.avatarUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">
                      {row.submitted.username ?? row.user?.username ?? "Unknown"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5">
                      <VerifiedBadge tier={row.tier} className="w-3 h-3" />
                      <span className="text-[10px] text-white/50">{TIER_LABELS[row.tier]}</span>
                    </span>
                    <span
                      className={`text-[10px] rounded-full px-2 py-0.5 border ${
                        row.status === "pending"
                          ? "border-purple-400/40 text-purple-200"
                          : row.status === "approved"
                            ? "border-white/20 text-white/60"
                            : "border-danger/40 text-danger"
                      }`}
                    >
                      {row.status}
                    </span>
                    <span className="text-[11px] text-white/35 tabular-nums ml-auto">
                      {row.nftsCreated.toLocaleString()} NFTs created
                    </span>
                  </div>
                  <div className="text-xs text-white/35 font-mono mt-0.5">{row.user?.address}</div>
                  {row.submitted.bio && (
                    <p className="text-xs text-white/55 mt-2 max-w-2xl leading-relaxed">
                      {row.submitted.bio}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-2">
                    {Object.entries(row.submitted.socials ?? {})
                      .filter(([, v]) => !!v)
                      .map(([k, v]) => (
                        <span key={k} className="text-[11px] text-white/40">
                          {k}: <span className="text-white/60">{v}</span>
                        </span>
                      ))}
                  </div>
                  {row.submitted.idDocumentUrl ? (
                    <a
                      href={row.submitted.idDocumentUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 text-xs text-purple-300 hover:text-purple-200 mt-3"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> View ID document
                    </a>
                  ) : row.tier === "purple" && row.status !== "pending" ? (
                    <p className="text-[11px] text-white/30 mt-3">
                      ID document deleted after review.
                    </p>
                  ) : null}
                </div>
              </div>

              {row.status === "pending" && (
                <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center gap-2">
                  <input
                    value={notes[row._id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [row._id]: e.target.value }))}
                    placeholder="Note to the applicant (optional)"
                    className="flex-1 min-w-48 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/60"
                  />
                  <button
                    disabled={busy === row._id}
                    onClick={() => decide(row, "approved")}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium border border-purple-400/50 bg-purple-500/15 text-purple-100 disabled:opacity-40"
                  >
                    {busy === row._id ? "Saving…" : "Approve"}
                  </button>
                  <button
                    disabled={busy === row._id}
                    onClick={() => decide(row, "rejected")}
                    className="rounded-lg px-3 py-1.5 text-xs border border-white/10 text-white/50 hover:border-danger/40 hover:text-danger transition disabled:opacity-40"
                  >
                    Reject
                  </button>
                </div>
              )}
              {row.status !== "pending" && row.reviewNote && (
                <p className="text-xs text-white/40 mt-3 pt-3 border-t border-white/10">
                  Note: {row.reviewNote}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
