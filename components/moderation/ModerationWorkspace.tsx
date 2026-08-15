"use client";

import { useState } from "react";
import { CheckCircle2, Clock3, ShieldCheck, XCircle } from "lucide-react";

type Report = { _id: string; targetType: string; targetId: string; reason: string; details?: string; status: "open" | "reviewing" | "resolved" | "dismissed"; createdAt: string; reporter?: { username?: string; address?: string } | null; resolutionNote?: string };
const statuses: Report["status"][] = ["open", "reviewing", "resolved", "dismissed"];

export function ModerationWorkspace({ initialReports }: { initialReports: Report[] }) {
  const [reports, setReports] = useState(initialReports);
  const [busy, setBusy] = useState<string | null>(null);
  async function update(report: Report, status: Report["status"]) {
    setBusy(report._id);
    const response = await fetch(`/api/reports/${report._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setBusy(null);
    if (response.ok) setReports((all) => all.map((entry) => entry._id === report._id ? { ...entry, status } : entry));
  }
  const openCount = reports.filter((report) => report.status === "open" || report.status === "reviewing").length;
  return <div className="max-w-7xl mx-auto px-6 py-10"><div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8"><div><p className="text-purple-300 text-sm font-medium mb-2">Trust & safety</p><h1 className="font-display text-3xl sm:text-4xl font-semibold text-white">Moderation workspace</h1><p className="text-sm text-white/50 mt-2">Review community reports and keep the marketplace trustworthy.</p></div><div className="surface-card px-4 py-3 text-sm text-white/60"><ShieldCheck className="inline w-4 h-4 text-purple-300 mr-2" />{openCount} report{openCount === 1 ? "" : "s"} awaiting action</div></div><div className="space-y-3">{reports.length === 0 ? <div className="surface-card p-10 text-center text-sm text-white/45">No reports need review.</div> : reports.map((report) => <article key={report._id} className="surface-card p-5"><div className="flex flex-col md:flex-row md:items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className="rounded-full bg-purple-500/15 px-2.5 py-1 text-xs font-medium text-purple-200 capitalize">{report.reason.replace("_", " ")}</span><span className="text-xs text-white/35 capitalize">{report.targetType} · {report.targetId}</span></div><p className="text-sm text-white/80 mt-3">{report.details || "No additional context supplied."}</p><p className="text-xs text-white/35 mt-3">Reported by {report.reporter?.username ?? report.reporter?.address ?? "Unknown"} · {new Date(report.createdAt).toLocaleString()}</p></div><div className="flex flex-wrap gap-2 shrink-0">{statuses.map((status) => <button key={status} disabled={busy === report._id || report.status === status} onClick={() => update(report, status)} className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition ${report.status === status ? "border-purple-400 bg-purple-500/15 text-purple-100" : "border-white/10 text-white/60 hover:border-purple-400/50"}`}>{status}</button>)}</div></div></article>)}</div></div>;
}
