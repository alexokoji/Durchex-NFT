"use client";

import { useEffect, useState } from "react";
import { Info, Copy, Check, Globe, Share2, Star, BadgeCheck, X as XIcon } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import clsx from "clsx";
import { CollectionDetailView } from "@/lib/types";
import { CHAIN_META } from "@/lib/web3/config";
import { PHASE_KEYS, isPhaseLive } from "@/lib/mintPhases";

function truncate(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Where the collection sits in its mint lifecycle, derived from the phases
 * rather than stored: the earliest start still in the future means it hasn't
 * opened, any live phase means it's minting, and a collection whose phases
 * have all closed has ended. Collections that never configured phases have
 * no mint to report at all.
 */
export function mintStatus(collection: CollectionDetailView, now = new Date()) {
  // Supply outranks the schedule. A phase left enabled after the last unit
  // is gone still looks "live" by its dates, so the badge went on claiming
  // MINTING NOW on a collection with nothing left to mint.
  if (collection.mintedOut) return { label: "SOLD OUT", startsAt: null as Date | null };

  const phases = PHASE_KEYS.map((key) => collection.mintPhases[key]).filter((phase) => phase.enabled);
  if (phases.length === 0) return { label: null, startsAt: null as Date | null };

  if (phases.some((phase) => isPhaseLive(phase, now))) return { label: "MINTING NOW", startsAt: null };

  const upcoming = phases
    .map((phase) => (phase.startsAt ? new Date(phase.startsAt) : null))
    .filter((date): date is Date => !!date && date > now)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  if (upcoming) return { label: "MINTING SOON", startsAt: upcoming };
  return { label: "MINT ENDED", startsAt: null };
}

function Badge({ children, accent }: { children: React.ReactNode; accent?: "live" | "soon" | "done" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase border font-mono",
        accent === "live" && "border-success/50 text-success bg-success/10",
        accent === "soon" && "border-sky-400/50 text-sky-300 bg-sky-400/10",
        accent === "done" && "border-purple-400/50 text-purple-200 bg-purple-500/10",
        !accent && "border-white/12 text-white/60 bg-white/[0.03]"
      )}
    >
      {children}
    </span>
  );
}

function IconAction({
  label,
  href,
  onClick,
  children,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const className =
    "w-9 h-9 grid place-items-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className={className}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} aria-label={label} title={label} className={className}>
      {children}
    </button>
  );
}

/** Ticks once a second so the countdown stays honest without a page reload. */
function Countdown({ target }: { target: Date }) {
  const [remaining, setRemaining] = useState(() => target.getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(target.getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (remaining <= 0) return null;
  const seconds = Math.floor(remaining / 1000);
  const parts = [
    { value: Math.floor(seconds / 86400), label: "DAYS" },
    { value: Math.floor((seconds % 86400) / 3600), label: "HOURS" },
    { value: Math.floor((seconds % 3600) / 60), label: "MINS" },
    { value: seconds % 60, label: "SECS" },
  ];

  return (
    <div className="mt-6 flex items-center gap-3 sm:gap-4">
      <span className="font-mono text-[11px] uppercase tracking-wide text-white/40 max-w-[4.5rem] leading-tight">
        Minting in
      </span>
      {parts.map((part) => (
        <div key={part.label} className="surface-card px-3 sm:px-4 py-2.5 text-center min-w-[4.25rem]">
          <div className="font-mono text-xl sm:text-2xl font-semibold text-white tabular-nums">{part.value}</div>
          <div className="font-mono text-[10px] tracking-wide text-white/35">{part.label}</div>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-wide text-white/35 mb-1.5">{label}</div>
      <div
        className={clsx(
          "font-mono text-lg sm:text-xl font-semibold tabular-nums",
          tone === "up" && "text-success",
          tone === "down" && "text-danger",
          !tone && "text-white"
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * The collection's identity row and headline numbers — name, links, mint
 * status and the stats a buyer actually decides on (floor and where it's
 * moved, the best standing offer, volume, and how widely held it is).
 */
export function CollectionMeta({
  collection,
  logo,
}: {
  collection: CollectionDetailView;
  /** Rendered inline to the left of the name, as in the reference layout. */
  logo?: React.ReactNode;
}) {
  const { format } = useCurrency();
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [favorited, setFavorited] = useState(false);

  const status = mintStatus(collection);
  const chain = CHAIN_META[collection.chainId];
  const supply = collection.maxSupply > 0 ? collection.maxSupply : collection.items;
  const ownerPct = collection.items > 0 ? (collection.owners / collection.items) * 100 : 0;
  const change = collection.floorChange1dPct;

  async function copyContract() {
    if (!collection.contractAddress) return;
    await navigator.clipboard?.writeText(collection.contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: collection.name, url }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }

  return (
    <div className="px-4 sm:px-8">
      <div className="flex items-start gap-4">
        {logo}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3 flex-wrap">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white">{collection.name}</h1>
            {collection.creatorTier !== "none" ? (
              <VerifiedBadge tier={collection.creatorTier} className="w-5 h-5 mt-1.5" />
            ) : (
              collection.verified && <BadgeCheck className="w-5 h-5 mt-1.5 text-purple-400 shrink-0" />
            )}
            <button
              onClick={() => setFavorited((value) => !value)}
              aria-label={favorited ? "Remove from watchlist" : "Add to watchlist"}
              className="mt-1 text-white/50 hover:text-white transition"
            >
              <Star className={clsx("w-5 h-5", favorited && "fill-purple-400 text-purple-400")} />
            </button>
          </div>

          <div className="flex items-center gap-0.5 -ml-2 mt-1">
        <IconAction label="About this collection" onClick={() => setDescriptionOpen((value) => !value)}>
          <Info className="w-[18px] h-[18px]" />
        </IconAction>
        {collection.contractAddress && (
          <IconAction label={`Copy contract ${truncate(collection.contractAddress)}`} onClick={copyContract}>
            {copied ? <Check className="w-[18px] h-[18px] text-success" /> : <Copy className="w-[18px] h-[18px]" />}
          </IconAction>
        )}
        {collection.links.website && (
          <IconAction label="Website" href={collection.links.website}>
            <Globe className="w-[18px] h-[18px]" />
          </IconAction>
        )}
        {collection.links.twitter && (
          <IconAction label="X" href={collection.links.twitter}>
            <XIcon className="w-[18px] h-[18px]" />
          </IconAction>
        )}
            <IconAction label="Share" onClick={share}>
              {shared ? <Check className="w-[18px] h-[18px] text-success" /> : <Share2 className="w-[18px] h-[18px]" />}
            </IconAction>
          </div>
        </div>
      </div>

      {descriptionOpen && collection.description && (
        <p className="text-sm text-white/55 max-w-2xl mt-3 leading-relaxed">{collection.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        {chain && (
          <Badge>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: chain.accent }} />
            {chain.label}
          </Badge>
        )}
        {supply > 0 && <Badge>{supply.toLocaleString()} items</Badge>}
        <Badge>
          {new Date(collection.createdAt)
            .toLocaleDateString(undefined, { month: "short", year: "numeric" })
            .toUpperCase()}
        </Badge>
        {status.label && (
          <Badge
            accent={
              status.label === "MINTING NOW"
                ? "live"
                : status.label === "MINTING SOON"
                  ? "soon"
                  : status.label === "SOLD OUT"
                    ? "done"
                    : undefined
            }
          >
            {status.label}
          </Badge>
        )}
      </div>

      {status.startsAt && <Countdown target={status.startsAt} />}

      <div className="mt-7 pt-6 border-t border-white/8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-6">
        <Stat label="Floor price" value={collection.floorEth > 0 ? format(collection.floorEth) : "—"} />
        <Stat
          label="1D floor %"
          value={change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
          tone={change === null || change === 0 ? undefined : change > 0 ? "up" : "down"}
        />
        <Stat label="Top offer" value={collection.topOfferEth ? `${collection.topOfferEth} WETH` : "—"} />
        <Stat label="24h volume" value={format(collection.volume24hEth)} />
        <Stat label="Total volume" value={format(collection.totalVolumeEth)} />
        <Stat
          label="Owners (unique)"
          value={`${collection.owners.toLocaleString()}${ownerPct > 0 ? ` (${ownerPct.toFixed(1)}%)` : ""}`}
        />
      </div>
    </div>
  );
}
