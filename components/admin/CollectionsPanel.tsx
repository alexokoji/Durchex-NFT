"use client";

import { useEffect, useState } from "react";
import { Search, Loader2, Trash2 } from "lucide-react";

type Row = {
  _id: string;
  slug: string;
  name: string;
  category: string;
  verified: boolean;
  featured: boolean;
  hidden: boolean;
  royaltyBps: number;
  stats?: { items?: number; owners?: number; totalVolumeEth?: number };
};

export function CollectionsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function load(query: string) {
    const res = await fetch(`/api/admin/collections${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    const data = await res.json();
    setRows(data.collections ?? []);
    setLoading(false);
  }

  function search(query: string) {
    setLoading(true);
    load(query);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount, not a render loop
    load("");
  }, []);

  async function toggle(row: Row, field: "verified" | "featured" | "hidden") {
    setBusy(row._id);
    const res = await fetch(`/api/admin/collections/${row._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !row[field] }),
    });
    setBusy(null);
    if (res.ok) setRows((all) => all.map((r) => (r._id === row._id ? { ...r, [field]: !r[field] } : r)));
  }

  async function remove(row: Row) {
    setBusy(row._id);
    setDeleteError(null);
    const res = await fetch(`/api/admin/collections/${row._id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    setConfirmingDelete(null);
    if (res.ok) {
      setRows((all) => all.filter((r) => r._id !== row._id));
    } else {
      setDeleteError(data.error ?? "Couldn't delete that collection.");
    }
  }

  async function updateRoyalty(row: Row, value: string) {
    const bps = Math.round(Number(value) * 100);
    if (!Number.isFinite(bps)) return;
    setBusy(row._id);
    const res = await fetch(`/api/admin/collections/${row._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ royaltyBps: bps }),
    });
    setBusy(null);
    if (res.ok) setRows((all) => all.map((r) => (r._id === row._id ? { ...r, royaltyBps: bps } : r)));
  }

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <h1 className="font-display text-2xl font-semibold text-white mb-1">Collections</h1>
      <p className="text-sm text-white/45 mb-6">Verify, feature, hide, or adjust royalty caps on any collection.</p>

      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(q)}
          placeholder="Search by name or slug…"
          className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
        />
      </div>

      <div className="surface-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 text-xs border-b border-white/5">
              <th className="px-4 py-3 font-medium">Collection</th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3 font-medium">Owners</th>
              <th className="px-4 py-3 font-medium">Volume</th>
              <th className="px-4 py-3 font-medium">Royalty %</th>
              <th className="px-4 py-3 font-medium">Verified</th>
              <th className="px-4 py-3 font-medium">Featured</th>
              <th className="px-4 py-3 font-medium">Hidden</th>
              <th className="px-4 py-3 font-medium sr-only">Delete</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-white/40">
                  <Loader2 className="inline w-4 h-4 animate-spin mr-2" /> Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-white/40">No collections found.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row._id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{row.name}</div>
                    <div className="text-xs text-white/35">{row.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-white/60">{row.stats?.items ?? 0}</td>
                  <td className="px-4 py-3 text-white/60">{row.stats?.owners ?? 0}</td>
                  <td className="px-4 py-3 text-white/60">{(row.stats?.totalVolumeEth ?? 0).toFixed(2)} ETH</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="50"
                      disabled={busy === row._id}
                      defaultValue={(row.royaltyBps / 100).toFixed(1)}
                      onBlur={(e) => updateRoyalty(row, e.target.value)}
                      className="w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500/60"
                    />
                  </td>
                  {(["verified", "featured", "hidden"] as const).map((field) => (
                    <td key={field} className="px-4 py-3">
                      <button
                        disabled={busy === row._id}
                        onClick={() => toggle(row, field)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium border transition ${
                          row[field] ? "border-purple-400 bg-purple-500/15 text-purple-100" : "border-white/10 text-white/40 hover:border-white/25"
                        }`}
                      >
                        {row[field] ? "Yes" : "No"}
                      </button>
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    {confirmingDelete === row._id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          disabled={busy === row._id}
                          onClick={() => remove(row)}
                          className="rounded-full px-2.5 py-1 text-xs font-medium border border-danger/50 bg-danger/15 text-danger"
                        >
                          {busy === row._id ? "Deleting…" : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmingDelete(null)}
                          className="rounded-full px-2.5 py-1 text-xs border border-white/10 text-white/40"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        title="Delete permanently — only possible while nothing has been minted on-chain"
                        disabled={busy === row._id}
                        onClick={() => {
                          setDeleteError(null);
                          setConfirmingDelete(row._id);
                        }}
                        className="text-white/25 hover:text-danger transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {deleteError && (
        <p className="text-xs text-danger mt-3">
          {deleteError} Use the Hidden toggle to take it off the marketplace instead.
        </p>
      )}
    </div>
  );
}
