"use client";

import { useEffect, useState } from "react";
import { Search, Loader2 } from "lucide-react";

type Row = {
  _id: string;
  address: string;
  username: string;
  role: "user" | "moderator" | "admin";
  banned: boolean;
  banReason?: string;
  isVerified: boolean;
};

const ROLES: Row["role"][] = ["user", "moderator", "admin"];

export function UsersPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<Row | null>(null);
  const [banReasonInput, setBanReasonInput] = useState("");

  async function load(query: string) {
    const res = await fetch(`/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    const data = await res.json();
    setRows(data.users ?? []);
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

  async function patch(row: Row, body: Record<string, unknown>) {
    setBusy(row._id);
    const res = await fetch(`/api/admin/users/${row._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (res.ok) {
      const data = await res.json();
      setRows((all) => all.map((r) => (r._id === row._id ? { ...r, ...data.user } : r)));
    }
  }

  function confirmBan() {
    if (!banTarget) return;
    patch(banTarget, { banned: true, banReason: banReasonInput });
    setBanTarget(null);
    setBanReasonInput("");
  }

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <h1 className="font-display text-2xl font-semibold text-white mb-1">Users</h1>
      <p className="text-sm text-white/45 mb-6">Manage roles and ban wallets that violate platform rules.</p>

      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(q)}
          placeholder="Search by username or address…"
          className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
        />
      </div>

      <div className="surface-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 text-xs border-b border-white/5">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-white/40">
                  <Loader2 className="inline w-4 h-4 animate-spin mr-2" /> Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-white/40">No users found.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row._id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{row.username}</div>
                    <div className="text-xs text-white/35">{row.address}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={row.role}
                      disabled={busy === row._id}
                      onChange={(e) => patch(row, { role: e.target.value })}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500/60"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r} className="bg-surface-1">
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {row.banned ? (
                      <span className="rounded-full px-2.5 py-1 text-xs font-medium border border-danger/40 bg-danger/10 text-danger" title={row.banReason}>
                        Banned
                      </span>
                    ) : (
                      <span className="rounded-full px-2.5 py-1 text-xs font-medium border border-white/10 text-white/40">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      disabled={busy === row._id}
                      onClick={() => (row.banned ? patch(row, { banned: false }) : setBanTarget(row))}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/60 hover:border-purple-400/50 hover:text-white transition"
                    >
                      {row.banned ? "Unban" : "Ban"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {banTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setBanTarget(null)}>
          <div className="surface-card p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-white font-semibold mb-1">Ban {banTarget.username}</h2>
            <p className="text-xs text-white/45 mb-4">This signs them out everywhere and blocks listing, bidding, and minting.</p>
            <textarea
              autoFocus
              value={banReasonInput}
              onChange={(e) => setBanReasonInput(e.target.value)}
              placeholder="Reason (optional)"
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60 resize-none mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setBanTarget(null)} className="px-3.5 py-1.5 text-sm text-white/60 hover:text-white">
                Cancel
              </button>
              <button onClick={confirmBan} className="px-3.5 py-1.5 text-sm rounded-lg bg-danger/20 border border-danger/40 text-danger hover:bg-danger/30">
                Confirm ban
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
