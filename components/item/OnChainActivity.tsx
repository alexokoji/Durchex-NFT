"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Gavel, Loader2, Send, ShoppingCart, Sparkles, Tag } from "lucide-react";
import clsx from "clsx";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { ActivityView } from "@/lib/types";
import type { VerificationTier } from "@/lib/verification";

type Party = { address: string; username: string | null; verificationTier: VerificationTier };
type ChainTransfer = {
  txHash: string;
  type: "mint" | "transfer";
  quantity: number;
  timestamp: string | null;
  from: Party;
  to: Party;
};

type Row = {
  key: string;
  event: "Sale" | "Listing" | "Item Offer" | "Transfer" | "Mint";
  priceEth: number | null;
  quantity: number;
  from: Party | null;
  to: Party | null;
  at: string | null;
  txHash: string | null;
};

const FILTERS = ["All", "Sale", "Listing", "Item Offer", "Transfer", "Mint"] as const;
type Filter = (typeof FILTERS)[number];

const ICONS: Record<Row["event"], typeof Tag> = {
  Sale: ShoppingCart,
  Listing: Tag,
  "Item Offer": Gavel,
  Transfer: Send,
  Mint: Sparkles,
};

/**
 * A token's full history: what happened here, plus what happened on-chain
 * anywhere else.
 *
 * Our own activity records only ever contain Durchex trades, so a token
 * minted or traded elsewhere showed an empty tab that was simply untrue.
 * Chain transfers are merged in and de-duplicated against our records by
 * transaction hash, so a sale that happened here appears once, as a sale,
 * rather than twice as both a sale and a bare transfer.
 */
export function OnChainActivity({
  itemId,
  activity,
  chainId,
}: {
  itemId: string;
  activity: ActivityView[];
  chainId: number;
}) {
  const [transfers, setTransfers] = useState<ChainTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("All");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/items/${itemId}/onchain-activity`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setNote(data.error);
        else if (data.unavailable) setNote("Chain history isn't configured for this network.");
        else setTransfers(data.transfers ?? []);
      })
      .catch(() => !cancelled && setNote("Couldn't reach the chain index."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const rows = useMemo(() => {
    const asParty = (u: ActivityView["from"]): Party | null =>
      u ? { address: u.address, username: u.username, verificationTier: u.verificationTier } : null;

    const local: Row[] = activity
      .filter((a) => a.type !== "cancel")
      .map((a) => ({
        key: `local-${a.id}`,
        event:
          a.type === "sale"
            ? "Sale"
            : a.type === "list"
              ? "Listing"
              : a.type === "offer" || a.type === "bid"
                ? "Item Offer"
                : a.type === "mint"
                  ? "Mint"
                  : "Transfer",
        priceEth: a.priceEth,
        quantity: 1,
        from: asParty(a.from),
        to: asParty(a.to),
        at: a.createdAt,
        txHash: null,
      }));

    // Anything we already describe with a price and a counterparty is the
    // better record of the same event, so the raw transfer is dropped.
    const localTimes = new Set(local.filter((r) => r.event === "Sale" || r.event === "Mint").map((r) => r.at));
    const chain: Row[] = transfers
      .filter((t) => !(t.timestamp && localTimes.has(t.timestamp)))
      .map((t) => ({
        key: `chain-${t.txHash}-${t.to.address}-${t.quantity}`,
        event: t.type === "mint" ? "Mint" : "Transfer",
        priceEth: null,
        quantity: t.quantity,
        from: t.from,
        to: t.to,
        at: t.timestamp,
        txHash: t.txHash,
      }));

    return [...local, ...chain].sort((a, b) => {
      if (!a.at) return 1;
      if (!b.at) return -1;
      return new Date(b.at).getTime() - new Date(a.at).getTime();
    });
  }, [activity, transfers]);

  const shown = filter === "All" ? rows : rows.filter((r) => r.event === filter);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              "rounded-full px-3 py-1.5 text-xs font-medium border transition",
              filter === f
                ? "border-purple-400/60 bg-purple-500/15 text-purple-100"
                : "border-white/10 text-white/45 hover:border-white/25 hover:text-white/70"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-white/40 mb-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-300" /> Reading chain history…
        </div>
      )}
      {note && <p className="text-xs text-white/35 mb-3">{note}</p>}

      {shown.length === 0 && !loading ? (
        <p className="text-sm text-white/35 py-10 text-center">No {filter === "All" ? "" : filter.toLowerCase()} activity yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[38rem]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-white/35 border-b border-white/10">
                <th className="py-2.5 pr-4 font-medium">Event</th>
                <th className="py-2.5 pr-4 font-medium">Price</th>
                <th className="py-2.5 pr-4 font-medium">Qty</th>
                <th className="py-2.5 pr-4 font-medium">From</th>
                <th className="py-2.5 pr-4 font-medium">To</th>
                <th className="py-2.5 font-medium text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const Icon = ICONS[row.event];
                return (
                  <tr key={row.key} className="border-b border-white/5 last:border-0">
                    <td className="py-3 pr-4">
                      <span className="flex items-center gap-2 text-white/80">
                        <Icon className="w-3.5 h-3.5 text-white/35 shrink-0" />
                        {row.event}
                      </span>
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-white/70">
                      {row.priceEth !== null && row.priceEth > 0
                        ? `${row.priceEth} ETH`
                        : row.priceEth === 0
                          ? "Free"
                          : "—"}
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-white/55">{row.quantity}</td>
                    <td className="py-3 pr-4">
                      <PartyCell party={row.from} />
                    </td>
                    <td className="py-3 pr-4">
                      <PartyCell party={row.to} />
                    </td>
                    <td className="py-3 text-right text-white/35 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 justify-end">
                        {row.at ? timeAgo(row.at) : "—"}
                        {row.txHash && (
                          <a
                            href={`${chainId === 1 ? "https://etherscan.io" : "https://sepolia.etherscan.io"}/tx/${row.txHash}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-white/25 hover:text-purple-300 transition"
                            aria-label="View transaction"
                          >
                            <ArrowUpRight className="w-3 h-3" />
                          </a>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ZERO = "0x0000000000000000000000000000000000000000";

function PartyCell({ party }: { party: Party | null }) {
  if (!party) return <span className="text-white/25">—</span>;
  if (party.address?.toLowerCase() === ZERO) {
    return <span className="text-white/35">NullAddress</span>;
  }
  const label = party.username ?? `${party.address.slice(0, 6)}…${party.address.slice(-4)}`;
  return (
    <Link
      href={`/profile/${party.address}`}
      className="inline-flex items-center gap-1 text-white/70 hover:text-purple-300 transition"
    >
      <span className="truncate max-w-[9rem]">{label}</span>
      <VerifiedBadge tier={party.verificationTier} className="w-3 h-3" />
    </Link>
  );
}

function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units: [number, string][] = [
    [60, "m"],
    [3600, "h"],
    [86400, "d"],
  ];
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  void units;
  const days = Math.floor(seconds / 86400);
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString();
}
