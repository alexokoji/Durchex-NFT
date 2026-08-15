"use client";

import { useState } from "react";
import { Flag } from "lucide-react";

const reasons = [
  ["copyright", "Copyright or IP infringement"],
  ["counterfeit", "Counterfeit or impersonation"],
  ["explicit", "Explicit or prohibited content"],
  ["spam", "Spam or deceptive listing"],
  ["harassment", "Harassment or hateful content"],
  ["other", "Other"],
] as const;

export function ReportButton({ targetId, targetType = "item" }: { targetId: string; targetType?: "item" | "collection" | "user" }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof reasons)[number][0]>("copyright");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit() {
    setSaving(true); setMessage("");
    const response = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetId, targetType, reason, details }) });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) { setMessage(data.error ?? "Could not submit report"); return; }
    setMessage("Report submitted. Our moderation team will review it."); setDetails("");
  }
  return <div className="mt-5"><button onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-1.5 text-xs text-white/35 hover:text-white transition"><Flag className="w-3.5 h-3.5" />Report this item</button>{open && <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-4"><p className="text-sm font-medium text-white">Report content</p><p className="text-xs text-white/45 mt-1">Reports are reviewed by Durchex moderators.</p><select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)} className="mt-3 w-full rounded-lg border border-white/10 bg-void px-3 py-2 text-sm text-white">{reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1200} placeholder="Add context (optional)" className="mt-2 w-full min-h-20 rounded-lg border border-white/10 bg-void px-3 py-2 text-sm text-white placeholder:text-white/25" /><div className="flex items-center gap-3 mt-3"><button disabled={saving} onClick={submit} className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Submitting…" : "Submit report"}</button>{message && <span className="text-xs text-white/55">{message}</span>}</div></div>}</div>;
}
