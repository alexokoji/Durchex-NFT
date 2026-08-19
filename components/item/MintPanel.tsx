"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Globe, Gem, Lock, Copy, Check, Clock } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { useConnectFlow } from "@/components/wallet/ConnectFlow";
import { BuyLazyButton } from "@/components/item/BuyLazyButton";
import { BuyEditionButton } from "@/components/item/BuyEditionButton";
import { CHAIN_META } from "@/lib/web3/config";
import { PHASE_KEYS, PHASE_LABELS, PhaseKey, isPhaseLive, hasConfiguredPhases } from "@/lib/mintPhases";
import { ItemDetailView, MintPhaseView } from "@/lib/types";

type PhaseEligibility = { enabled: boolean; eligible: boolean; claimed: number; remaining: number | null };

function formatCountdown(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [
    { value: days, label: "DAYS" },
    { value: hours, label: "HOURS" },
    { value: minutes, label: "MINS" },
    { value: secs, label: "SECS" },
  ];
}

/** Re-renders once a second so every countdown on the panel stays live. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function phaseWindow(phase: MintPhaseView, now: number) {
  const startsAt = phase.startsAt ? new Date(phase.startsAt).getTime() : null;
  const endsAt = phase.endsAt ? new Date(phase.endsAt).getTime() : null;
  if (startsAt && now < startsAt) return { state: "upcoming" as const, at: startsAt };
  if (endsAt && now > endsAt) return { state: "ended" as const, at: endsAt };
  if (endsAt) return { state: "live" as const, at: endsAt };
  return { state: "live" as const, at: null };
}

function Countdown({ target, label }: { target: number; label: string }) {
  const now = useNow(true);
  const parts = formatCountdown(target - now);
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <span className="font-mono text-[11px] uppercase tracking-wide text-white/40 max-w-[4.5rem] leading-tight">{label}</span>
      {parts.map((part) => (
        <div key={part.label} className="rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-center min-w-[3.75rem]">
          <div className="font-mono text-lg font-semibold text-white tabular-nums">{part.value}</div>
          <div className="font-mono text-[10px] tracking-wide text-white/35">{part.label}</div>
        </div>
      ))}
    </div>
  );
}

function PhaseCard({
  phaseKey,
  phase,
  eligibility,
  selected,
  now,
  onSelect,
}: {
  phaseKey: PhaseKey;
  phase: MintPhaseView;
  eligibility?: PhaseEligibility;
  selected: boolean;
  now: number;
  onSelect: () => void;
}) {
  const window = phaseWindow(phase, now);
  const live = window.state === "live";
  // Public is open to everyone; the other two are allowlisted, so without a
  // connected wallet we can't claim the visitor is eligible.
  const eligible = phaseKey === "public" || eligibility?.eligible;

  return (
    <button
      onClick={onSelect}
      className={clsx(
        "w-full text-left rounded-xl border p-4 transition",
        selected ? "border-purple-500 bg-purple-600/15" : "border-white/10 bg-white/[0.02] hover:border-white/25"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {phaseKey === "public" ? (
            <Globe className="w-4 h-4 text-sky-300" />
          ) : eligible ? (
            <Gem className="w-4 h-4 text-emerald-300" />
          ) : (
            <Lock className="w-4 h-4 text-white/30" />
          )}
          <span className="font-semibold text-white">{PHASE_LABELS[phaseKey]}</span>
        </div>
        <span
          className={clsx(
            "px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shrink-0",
            selected
              ? "bg-purple-500/25 border-purple-400/50 text-purple-100"
              : live
                ? "bg-success/10 border-success/40 text-success"
                : "bg-white/5 border-white/10 text-white/45"
          )}
        >
          {selected ? "Selected" : window.state === "upcoming" ? "Soon" : window.state === "ended" ? "Ended" : "Live"}
        </span>
      </div>

      <div className="font-display text-2xl font-semibold text-purple-300 mt-2">
        {phase.priceEth > 0 ? `${phase.priceEth} ETH` : "Free"}
      </div>

      <div className="text-xs text-white/45 mt-1">
        {phase.walletLimit > 0 ? `Max ${phase.walletLimit.toLocaleString()} per wallet` : "No wallet limit"}
      </div>

      {window.at && (
        <div className="flex items-center gap-1.5 text-[11px] text-white/40 mt-2">
          <Clock className="w-3 h-3" />
          {window.state === "upcoming" && `Starts ${new Date(window.at).toLocaleString()}`}
          {window.state === "live" && `Ends ${new Date(window.at).toLocaleString()}`}
          {window.state === "ended" && `Ended ${new Date(window.at).toLocaleString()}`}
        </div>
      )}
    </button>
  );
}

function CollectionDetails({ item }: { item: ItemDetailView }) {
  const [copied, setCopied] = useState(false);
  const chain = CHAIN_META[item.chainId];

  async function copy() {
    await navigator.clipboard?.writeText(item.contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="surface-card p-5 mt-5">
      <h3 className="font-display text-lg font-semibold text-white mb-4">Collection Details</h3>
      <dl className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-white/45">Total Supply:</dt>
          <dd className="font-semibold text-white tabular-nums">
            {item.collectionMaxSupply > 0 ? item.collectionMaxSupply.toLocaleString() : "Unlimited"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-white/45">Blockchain:</dt>
          <dd>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: chain?.accent ?? "#6B6478" }} />
              {chain?.label ?? `Chain ${item.chainId}`}
            </span>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-white/45">Royalty:</dt>
          <dd className="font-semibold text-white tabular-nums">{(item.royaltyBps / 100).toFixed(2)}%</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-white/45">Reveal:</dt>
          {/* Nothing in the schema defers artwork — every item carries its
              media from the moment it's created, so this is always instant. */}
          <dd className="font-semibold text-success">Instant Reveal</dd>
        </div>
        {item.contractAddress && (
          <div>
            <dt className="text-white/45 mb-1.5">Contract:</dt>
            <dd className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs font-mono text-white/80">
                {item.contractAddress}
              </code>
              <button
                onClick={copy}
                aria-label="Copy contract address"
                className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition shrink-0"
              >
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </button>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/**
 * Mint UI for an item whose collection runs mint phases: pick a phase, see
 * when it opens or closes, and mint only while one is actually live.
 *
 * A collection with no phases configured never reaches this component — the
 * item page falls back to the plain buy button, so nothing changes for the
 * collections that never opted in.
 */
export function MintPanel({ item }: { item: ItemDetailView }) {
  const { address } = useAccount();
  const { openConnect } = useConnectFlow();
  const now = useNow(true);
  const [selected, setSelected] = useState<PhaseKey | null>(null);
  const [eligibility, setEligibility] = useState<Record<string, PhaseEligibility> | null>(null);
  const [quantity, setQuantity] = useState(1);
  // A quantity control only means something for editions: an ERC-721 item is
  // a single token, so there's exactly one of it to mint.
  const editionSupply = item.standard === "ERC1155" ? Math.max(0, item.totalSupply - item.mintedSupply) : 1;

  // Only phases the creator actually turned on are offered; the rest were
  // never part of this collection's mint.
  const phases = useMemo(
    () => PHASE_KEYS.filter((key) => item.mintPhases[key].enabled).map((key) => ({ key, phase: item.mintPhases[key] })),
    [item.mintPhases]
  );
  const livePhases = phases.filter(({ phase }) => isPhaseLive(phase, new Date(now)));

  useEffect(() => {
    if (!address) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale eligibility when the wallet disconnects, not a render loop
      setEligibility(null);
      return;
    }
    fetch(`/api/collections/${item.collectionId}/eligibility`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setEligibility(data as Record<string, PhaseEligibility>);
      })
      .catch(() => setEligibility(null));
  }, [address, item.collectionId]);

  // Default to a phase the wallet can actually mint through, falling back to
  // the first live one so the summary always has something to describe.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- picks a default only once eligibility/phase data has loaded; a no-op once `selected` is set
    setSelected((current) => {
      if (current) return current;
      const eligibleLive = livePhases.find(({ key }) => key === "public" || eligibility?.[key]?.eligible);
      return eligibleLive?.key ?? livePhases[0]?.key ?? phases[0]?.key ?? null;
    });
  }, [livePhases, phases, eligibility]);

  const selectedPhase = selected ? item.mintPhases[selected] : null;
  const selectedLive = !!selectedPhase && isPhaseLive(selectedPhase, new Date(now));
  const selectedEligible = selected === "public" || (selected ? !!eligibility?.[selected]?.eligible : false);
  const remaining = selected ? eligibility?.[selected]?.remaining ?? null : null;

  // The soonest phase still ahead of us — what the headline countdown ticks
  // down to while nothing is open yet.
  const nextStart = phases
    .map(({ phase }) => (phase.startsAt ? new Date(phase.startsAt).getTime() : null))
    .filter((at): at is number => !!at && at > now)
    .sort((a, b) => a - b)[0];

  // The most this wallet could take in one go: never more than the edition
  // has left, and never more than the phase still allows it.
  const maxQuantity = Math.max(1, remaining === null ? editionSupply : Math.min(editionSupply, remaining));

  // A phase switch can lower the cap below what was already dialled in.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clamps quantity when switching to a phase with a lower cap; a no-op otherwise
    setQuantity((value) => Math.min(value, maxQuantity));
  }, [maxQuantity]);

  const canMint = livePhases.length > 0 && selectedLive && (!address || selectedEligible) && remaining !== 0;

  return (
    <div className="surface-card p-6">
      <h2 className="font-display text-2xl font-semibold text-white mb-1">Mint NFT</h2>

      <p className="text-sm text-white/45 mb-4">
        Select Minting Phase ({livePhases.length} Active)
      </p>

      <div className="space-y-3">
        {phases.map(({ key, phase }) => (
          <PhaseCard
            key={key}
            phaseKey={key}
            phase={phase}
            eligibility={eligibility?.[key]}
            selected={selected === key}
            now={now}
            onSelect={() => setSelected(key)}
          />
        ))}
      </div>

      {livePhases.length === 0 && nextStart && (
        <div className="mt-5">
          <Countdown target={nextStart} label="Minting in" />
        </div>
      )}

      {item.standard === "ERC1155" && (
        <div className="mt-5">
          <p className="text-sm font-medium text-white mb-2">Quantity</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              aria-label="Decrease quantity"
              className="w-11 h-11 rounded-lg bg-white/5 border border-white/10 text-white text-lg hover:bg-white/10 transition"
            >
              −
            </button>
            <div className="flex-1 text-center border-b border-white/15 pb-1">
              <span className="font-display text-2xl font-semibold text-white tabular-nums">{quantity}</span>
            </div>
            <button
              onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
              aria-label="Increase quantity"
              className="w-11 h-11 rounded-lg bg-white/5 border border-white/10 text-white text-lg hover:bg-white/10 transition"
            >
              +
            </button>
            <button
              onClick={() => setQuantity(maxQuantity)}
              className="h-11 px-4 rounded-lg bg-white/5 border border-white/10 text-sm font-semibold text-white hover:bg-white/10 transition"
            >
              MAX
            </button>
          </div>
          {address && remaining !== null && (
            <p className="text-xs text-amber-300 text-center mt-2">
              You can mint {remaining} more in this phase
            </p>
          )}
        </div>
      )}

      <div className="mt-5 rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-2.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-white/45">Price per NFT:</span>
          <span className="font-semibold text-white">
            {selectedPhase ? (selectedPhase.priceEth > 0 ? `${selectedPhase.priceEth} ETH` : "FREE") : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white/45">Quantity:</span>
          <span className="font-semibold text-white tabular-nums">{quantity}</span>
        </div>
        {address && remaining !== null && item.standard !== "ERC1155" && (
          <div className="flex items-center justify-between">
            <span className="text-white/45">You can still mint:</span>
            <span className="font-semibold text-white tabular-nums">{remaining}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-white/10 pt-2.5">
          <span className="font-semibold text-white">Total:</span>
          <span className="font-semibold text-purple-300">
            {selectedPhase ? `${+(selectedPhase.priceEth * quantity).toFixed(6)} ETH` : "—"}
            <span className="text-white/40 text-xs font-normal"> + fees</span>
          </span>
        </div>
      </div>

      <div className="mt-4">
        {!address ? (
          <>
            <Button size="lg" className="w-full" onClick={openConnect}>
              Connect Wallet to Mint
            </Button>
            <p className="text-xs text-white/35 text-center mt-2">
              Connect a wallet to see if you&apos;re eligible and preview your total cost.
            </p>
          </>
        ) : canMint ? (
          item.standard === "ERC1155" ? (
            <BuyEditionButton item={item} phase={selected ?? undefined} quantity={quantity} />
          ) : (
            <BuyLazyButton item={item} phase={selected ?? undefined} />
          )
        ) : (
          <>
            <Button size="lg" className="w-full opacity-50 pointer-events-none" aria-disabled>
              Mint Now
            </Button>
            <p className="text-xs text-white/40 text-center mt-2">
              {livePhases.length === 0
                ? "No mint phase is open yet — the timer above counts down to the next one."
                : remaining === 0
                  ? "You've minted everything this phase allows for your wallet."
                  : selectedLive
                    ? "This wallet isn't on the allowlist for the selected phase."
                    : "That phase isn't open right now — pick a live one to mint."}
            </p>
          </>
        )}
      </div>

      <CollectionDetails item={item} />
    </div>
  );
}

/** Whether an item should use the phase-aware mint UI at all. */
export function itemUsesMintPhases(item: ItemDetailView) {
  return hasConfiguredPhases(item.mintPhases) && PHASE_KEYS.some((key) => item.mintPhases[key].enabled);
}
