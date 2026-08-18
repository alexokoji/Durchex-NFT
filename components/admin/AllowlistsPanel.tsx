"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Trash2, Search, FileSpreadsheet, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";

type Phase = "gtd" | "fcfs";
type Entry = { _id: string; address: string; label?: string; updatedAt: string };
type ListState = { total: number; matched: number | null; entries: Entry[]; updatedAt: string | null };
type Lists = Record<Phase, ListState>;
type UploadReport = {
  phase: Phase;
  mode: "replace" | "append";
  parsed: number;
  added: number;
  updated: number;
  duplicatesInFile: number;
  skippedCount: number;
  skipped: string[];
  total: number;
};

const PHASES: { key: Phase; title: string; blurb: string }[] = [
  { key: "gtd", title: "GTD list", blurb: "Guaranteed spots — every wallet on this list is promised its allocation." },
  { key: "fcfs", title: "FCFS list", blurb: "First come, first served — these wallets share one allocation pool." },
];

function ListCard({
  phase,
  state,
  onUploaded,
  onCleared,
}: {
  phase: (typeof PHASES)[number];
  state: ListState | undefined;
  onUploaded: (lists: Lists, report: UploadReport) => void;
  onCleared: (lists: Lists) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const csv = await file.text();
    const res = await fetch("/api/admin/allowlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: phase.key, csv, mode }),
    });
    const data = await res.json();
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      return;
    }
    onUploaded(data.lists, data);
  }

  async function clear() {
    setBusy(true);
    const res = await fetch(`/api/admin/allowlists?phase=${phase.key}`, { method: "DELETE" });
    const data = await res.json();
    setBusy(false);
    setConfirmingClear(false);
    if (res.ok) onCleared(data.lists);
  }

  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h2 className="font-display text-lg font-semibold text-white">{phase.title}</h2>
        <span className="text-sm font-semibold text-purple-200 shrink-0">
          {(state?.total ?? 0).toLocaleString()} <span className="text-white/40 font-normal">wallets</span>
        </span>
      </div>
      <p className="text-xs text-white/45 mb-4">{phase.blurb}</p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(["replace", "append"] as const).map((option) => (
          <button
            key={option}
            onClick={() => setMode(option)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-xs font-medium border transition",
              mode === option
                ? "bg-purple-500/15 text-purple-100 border-purple-500/40"
                : "text-white/55 border-white/10 hover:text-white hover:bg-white/5"
            )}
          >
            {option === "replace" ? "Replace list" : "Add to list"}
          </button>
        ))}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />

      <div className="flex items-center gap-2">
        <Button onClick={() => fileRef.current?.click()} disabled={busy} size="sm" icon={busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}>
          {busy ? "Working…" : "Upload CSV"}
        </Button>
        {(state?.total ?? 0) > 0 &&
          (confirmingClear ? (
            <>
              <button onClick={clear} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25 transition">
                Delete all {state?.total.toLocaleString()}
              </button>
              <button onClick={() => setConfirmingClear(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/55 hover:text-white transition">
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingClear(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/55 border border-white/10 hover:text-danger hover:border-danger/40 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear list
            </button>
          ))}
      </div>

      {error && (
        <p className="mt-3 text-xs text-danger flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          {error}
        </p>
      )}

      {state?.updatedAt && (
        <p className="mt-3 text-[11px] text-white/30">Last updated {new Date(state.updatedAt).toLocaleString()}</p>
      )}

      <div className="mt-4 border-t border-white/5 pt-3">
        {state && state.entries.length > 0 ? (
          <>
            <p className="text-[11px] uppercase tracking-wide text-white/30 font-semibold mb-2">
              {state.matched !== null ? `${state.matched.toLocaleString()} matching` : "Most recent"}
            </p>
            <div className="max-h-56 overflow-y-auto -mx-1 px-1 space-y-1">
              {state.entries.map((entry) => (
                <div key={entry._id} className="flex items-center justify-between gap-3 text-xs py-1">
                  <span className="font-mono text-white/70 truncate">{entry.address}</span>
                  {entry.label && <span className="text-white/35 truncate max-w-[40%]">{entry.label}</span>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-white/30">{state?.matched === 0 ? "No wallets match that search." : "No wallets uploaded yet."}</p>
        )}
      </div>
    </div>
  );
}

export function AllowlistsPanel() {
  const [lists, setLists] = useState<Lists | null>(null);
  const [q, setQ] = useState("");
  const [report, setReport] = useState<UploadReport | null>(null);

  async function load(query: string) {
    const res = await fetch(`/api/admin/allowlists${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    const data = await res.json();
    setLists(data.lists ?? null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount, not a render loop
    load("");
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <h1 className="font-display text-2xl font-semibold text-white mb-1">Wallet Checker lists</h1>
      <p className="text-sm text-white/45 mb-6">
        Upload the GTD and FCFS allowlists as CSV. Wallets check themselves against these on the public{" "}
        <a href="/wallet-checker" className="text-purple-300 hover:text-purple-200 underline underline-offset-2">
          Wallet Checker
        </a>{" "}
        page.
      </p>

      <div className="surface-card p-4 mb-6 flex items-start gap-3">
        <FileSpreadsheet className="w-4 h-4 text-purple-300 shrink-0 mt-0.5" />
        <div className="text-xs text-white/50 leading-relaxed">
          <p className="text-white/70 font-medium mb-1">CSV format</p>
          One wallet per row. A header row is fine, and any row layout works as long as one column holds the{" "}
          <span className="font-mono text-white/70">0x…</span> address — a second column (handle, tier, note) is stored
          as a label and shown back to that wallet. Rows without a valid address are reported, not silently dropped.
        </div>
      </div>

      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(q)}
          placeholder="Search both lists by address…"
          className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
        />
      </div>

      {report && (
        <div className="surface-card p-4 mb-6 text-xs text-white/60">
          <p className="text-white/80 font-medium mb-1">
            {report.phase.toUpperCase()} list {report.mode === "replace" ? "replaced" : "updated"} — now{" "}
            {report.total.toLocaleString()} wallets.
          </p>
          <p>
            {report.parsed.toLocaleString()} rows read · {report.added.toLocaleString()} added ·{" "}
            {report.updated.toLocaleString()} updated
            {report.duplicatesInFile > 0 && ` · ${report.duplicatesInFile.toLocaleString()} duplicate rows in file`}
            {report.skippedCount > 0 && ` · ${report.skippedCount.toLocaleString()} rows without an address`}
          </p>
          {report.skipped.length > 0 && (
            <p className="mt-1.5 text-white/35 font-mono truncate">Skipped e.g.: {report.skipped.join(" | ")}</p>
          )}
        </div>
      )}

      {!lists ? (
        <Loader2 className="w-5 h-5 animate-spin text-white/40" />
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {PHASES.map((phase) => (
            <ListCard
              key={phase.key}
              phase={phase}
              state={lists[phase.key]}
              onUploaded={(next, uploadReport) => {
                setLists(next);
                setReport(uploadReport);
                setQ("");
              }}
              onCleared={(next) => {
                setLists(next);
                setReport(null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
