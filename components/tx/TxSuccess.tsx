"use client";

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";
import Link from "next/link";
import { X, ExternalLink, User } from "lucide-react";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { explorerTxUrl } from "@/lib/web3/explorer";

export type TxAction = "buy" | "mint" | "list" | "offer" | "bid" | "accept";

export type TxSuccessDetails = {
  action: TxAction;
  /** Item artwork for the hero tile; falls back to generated art. */
  imageUrl?: string | null;
  /** Seed for the generated-art fallback — usually the item or collection id. */
  seedKey?: string;
  /** What the celebration is about, e.g. the item or collection name. */
  subject?: string;
  /** One line of detail under the headline, e.g. "0.075 ETH". */
  detail?: string;
  txHash?: string | null;
  chainId?: number;
  /** Where "View on Profile" goes. Omitted for flows with nothing to show there. */
  profileHref?: string;
  /** Overrides the second button when the natural follow-up isn't the profile. */
  secondary?: { label: string; href: string };
};

const HEADLINES: Record<TxAction, string> = {
  buy: "Congrats! You got it!",
  mint: "Congrats! It's yours!",
  list: "It's listed!",
  offer: "Offer placed!",
  bid: "Bid placed!",
  accept: "Offer accepted!",
};

const SUBLINES: Record<TxAction, string> = {
  buy: "It's on its way to your wallet.",
  mint: "Freshly minted and in your wallet.",
  list: "Buyers can pick it up right now.",
  offer: "The owner has been notified.",
  bid: "You're in — we'll tell you if you're outbid.",
  accept: "The sale is settled on-chain.",
};

type TxSuccessValue = { celebrate: (details: TxSuccessDetails) => void };

const TxSuccessContext = createContext<TxSuccessValue | null>(null);

/**
 * One celebration for every transaction the marketplace can complete —
 * buying, minting, listing, offering, bidding and accepting. Each flow used
 * to render its own small green "done" box, which meant the moment a
 * purchase actually landed looked the same as a form validation notice.
 */
export function useTxSuccess() {
  const context = useContext(TxSuccessContext);
  if (!context) throw new Error("useTxSuccess must be used inside <TxSuccessProvider>");
  return context;
}

const CONFETTI_COLORS = ["#ec4899", "#22d3ee", "#f97316", "#a855f7", "#facc15", "#38bdf8", "#4ade80", "#f43f5e"];

/**
 * Pure-CSS confetti. Positions are derived from the piece's index rather
 * than Math.random so a re-render doesn't reshuffle mid-animation.
 */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 44 }, (_, index) => {
        const spread = (index * 37) % 100;
        return {
          left: spread,
          delay: ((index * 13) % 20) / 10,
          duration: 2.6 + ((index * 7) % 18) / 10,
          color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
          rotate: (index * 47) % 360,
          round: index % 5 === 0,
          size: 6 + (index % 4) * 2,
        };
      }),
    []
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((piece, index) => (
        <span
          key={index}
          className="absolute top-[-8%] tx-confetti-piece"
          style={
            {
              left: `${piece.left}%`,
              width: piece.size,
              height: piece.size * (piece.round ? 1 : 1.6),
              backgroundColor: piece.color,
              borderRadius: piece.round ? "9999px" : "2px",
              animationDelay: `${piece.delay}s`,
              animationDuration: `${piece.duration}s`,
              "--tx-rot": `${piece.rotate + 360}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function TxSuccessModal({ details, onClose }: { details: TxSuccessDetails; onClose: () => void }) {
  const receiptUrl = details.txHash && details.chainId ? explorerTxUrl(details.chainId, details.txHash) : null;
  const secondary =
    details.secondary ?? (details.profileHref ? { label: "View on Profile", href: details.profileHref } : null);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-2xl bg-surface-1 border border-white/10 shadow-2xl overflow-hidden">
        <Confetti />

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative px-6 pt-12 pb-8 text-center">
          <div className="w-40 h-40 mx-auto rounded-xl overflow-hidden bg-white/5 shadow-lg mb-6">
            {details.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- same treatment as the rest of the item UI
              <img src={details.imageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <GeneratedArt seedKey={details.seedKey ?? details.action} className="w-full h-full" />
            )}
          </div>

          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white mb-2">{HEADLINES[details.action]}</h2>
          <p className="text-sm text-white/50 mb-1">{SUBLINES[details.action]}</p>
          {(details.subject || details.detail) && (
            <p className="text-sm text-white/70 mb-6">
              {details.subject}
              {details.subject && details.detail && " · "}
              {details.detail && <span className="tabular-nums">{details.detail}</span>}
            </p>
          )}
          {!details.subject && !details.detail && <div className="mb-6" />}

          <div className="flex flex-wrap items-center justify-center gap-3">
            {receiptUrl && (
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white border border-white/15 hover:bg-white/5 transition"
              >
                <ExternalLink className="w-4 h-4" />
                View receipt
              </a>
            )}
            {secondary && (
              <Link
                href={secondary.href}
                onClick={onClose}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white border border-white/15 hover:bg-white/5 transition"
              >
                <User className="w-4 h-4 text-purple-300" />
                {secondary.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TxSuccessProvider({ children }: { children: ReactNode }) {
  const [details, setDetails] = useState<TxSuccessDetails | null>(null);
  const celebrate = useCallback((next: TxSuccessDetails) => setDetails(next), []);
  const value = useMemo(() => ({ celebrate }), [celebrate]);

  return (
    <TxSuccessContext.Provider value={value}>
      {children}
      {details && <TxSuccessModal details={details} onClose={() => setDetails(null)} />}
    </TxSuccessContext.Provider>
  );
}
