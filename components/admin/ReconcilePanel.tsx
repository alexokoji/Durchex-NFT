"use client";

import { useRef, useState } from "react";
import { Loader2, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Slice = {
  fromBlock: string;
  toBlock: string;
  nextBlock: string | null;
  head: string;
  salesSeen: number;
  alreadySynced: number;
  repaired: string[];
  failed: { txHash: string; reason: string }[];
};

/**
 * Runs the chain backfill from the panel.
 *
 * A full history is more blocks than one request can scan, so the endpoint
 * returns where it stopped and this keeps calling until it reports being
 * caught up. Progress is shown as it goes rather than after, because a
 * backfill over a real history takes minutes and a silent spinner for that
 * long is indistinguishable from a hang.
 */
export function ReconcilePanel() {
  const [chainId, setChainId] = useState(1);
  const [fromBlock, setFromBlock] = useState("");
  const [running, setRunning] = useState(false);
  const [slices, setSlices] = useState(0);
  const [at, setAt] = useState<{ block: string; head: string } | null>(null);
  const [repaired, setRepaired] = useState<string[]>([]);
  const [failed, setFailed] = useState<{ txHash: string; reason: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  async function run() {
    setRunning(true);
    setError(null);
    setSlices(0);
    setRepaired([]);
    setFailed([]);
    stop.current = false;

    let next: string | null = fromBlock.trim() || null;
    let first = true;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (stop.current) break;
        const res = await fetch("/api/admin/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // A blank start on the first slice means "continue from the
          // watermark"; after that we always pass the block the server
          // told us it stopped at.
          body: JSON.stringify({ chainId, fromBlock: first && !next ? undefined : next }),
        });
        // A timed-out or crashed function answers with an error page, not
        // JSON, so the body is read as text first — parsing it blind turns
        // every infrastructure failure into "unexpected end of JSON input",
        // which says nothing about what actually went wrong.
        const raw = await res.text();
        let data: Slice & { error?: string };
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(
            res.status === 504 || raw.trim() === ""
              ? `The scan timed out at block ${next ?? "start"}. Press Run again to resume from there.`
              : `Server returned ${res.status}: ${raw.slice(0, 120)}`
          );
        }
        if (!res.ok) throw new Error(data.error ?? "Backfill failed");
        first = false;

        setSlices((n) => n + 1);
        setAt({ block: data.toBlock, head: data.head });
        if (data.repaired.length) setRepaired((r) => [...r, ...data.repaired]);
        if (data.failed.length) setFailed((f) => [...f, ...data.failed]);

        if (!data.nextBlock) break;
        next = data.nextBlock;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backfill failed");
    } finally {
      setRunning(false);
    }
  }

  const pct =
    at && Number(at.head) > 0 ? Math.min(100, Math.round((Number(at.block) / Number(at.head)) * 100)) : 0;

  return (
    <div className="surface-card p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-white mb-1.5">
        <RefreshCw className="w-4 h-4 text-purple-300" /> Chain backfill
      </div>
      <p className="text-xs text-white/45 mb-4">
        Replays purchases the site never recorded — the usual cause of a holder opening their profile
        and finding nothing there. Safe to run repeatedly: already-recorded sales are skipped. Leave
        the start block blank to continue from where the nightly job last reached, or set it to the
        marketplace&rsquo;s deployment block for a full history.
      </p>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div>
          <label className="text-[10px] uppercase tracking-wide text-white/40 block mb-1">Chain</label>
          <select
            value={chainId}
            disabled={running}
            onChange={(e) => setChainId(Number(e.target.value))}
            className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
          >
            <option value={1} className="bg-surface-1">
              Ethereum
            </option>
            <option value={11155111} className="bg-surface-1">
              Sepolia
            </option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-white/40 block mb-1">
            Start block (optional)
          </label>
          <input
            value={fromBlock}
            disabled={running}
            onChange={(e) => setFromBlock(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="continue from watermark"
            className="w-48 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
          />
        </div>
        {running ? (
          <button
            onClick={() => {
              stop.current = true;
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white transition"
          >
            <Square className="w-3 h-3" /> Stop
          </button>
        ) : (
          <Button size="sm" onClick={run}>
            Run backfill
          </Button>
        )}
      </div>

      {(running || at) && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center gap-2 text-xs text-white/60 mb-2">
            {running && <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-300" />}
            <span>
              {running ? "Scanning" : "Finished"} · block {at?.block ?? "—"} of {at?.head ?? "—"} ·{" "}
              {slices} {slices === 1 ? "pass" : "passes"}
            </span>
            <span className="ml-auto tabular-nums text-white/40">{pct}%</span>
          </div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-white/50 mt-3">
            <span className="text-white">{repaired.length}</span> purchases repaired
            {failed.length > 0 && (
              <>
                {" · "}
                <span className="text-danger">{failed.length}</span> couldn&rsquo;t be verified
              </>
            )}
          </div>
          {failed.length > 0 && (
            <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto">
              {failed.slice(0, 20).map((f) => (
                <li key={f.txHash} className="text-[11px] text-white/35 font-mono truncate">
                  {f.txHash.slice(0, 14)}… — {f.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-xs text-danger mt-3">{error}</p>}
    </div>
  );
}
