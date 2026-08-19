"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Sparkles, Link2, Hash, Network, Check, Gavel, Tag } from "lucide-react";
import { TraitPill } from "@/components/nft/TraitPill";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { OnChainActivity } from "@/components/item/OnChainActivity";
import { useSession } from "@/hooks/useSession";
import { AcceptOfferButton } from "@/components/item/AcceptOfferButton";
import { ActivityView, BidView, ItemDetailView } from "@/lib/types";

const TABS = ["Details", "Properties", "Orders", "Activity"] as const;
type Tab = (typeof TABS)[number];

export function ItemTabs({
  item,
  offers,
  activity,
}: {
  item: ItemDetailView;
  offers: BidView[];
  activity: ActivityView[];
}) {
  const [tab, setTab] = useState<Tab>("Details");
  const { user } = useSession();
  // Who may accept an offer. For an ERC-721 that is the single owner; for
  // an edition it is anyone holding a unit, since each holder can sell
  // their own. Gating editions on Item.owner meant only the creator could
  // ever accept, so holders had no way to sell into a standing offer.
  const [balance, setBalance] = useState(0);
  useEffect(() => {
    if (!user || item.standard !== "ERC1155") return;
    fetch(`/api/items/${item.id}/balance`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setBalance(Number(data.quantity ?? 0)));
  }, [user, item.id, item.standard]);

  const isOwner =
    item.standard === "ERC1155"
      ? balance > 0
      : !!user && user.address === item.owner?.address;

  return (
    <div className="surface-card p-6">
      <div className="flex gap-1 border-b border-white/10 mb-5 -mt-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition",
              tab === t
                ? "border-purple-500 text-white"
                : "border-transparent text-white/45 hover:text-white"
            )}
          >
            {t}
            {t === "Orders" && offers.length > 0 && (
              <span className="ml-1.5 text-xs text-white/30">{offers.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "Properties" &&
        (item.traits.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {item.traits.map((t) => (
              <TraitPill key={t.traitType} traitType={t.traitType} value={t.value} rarity={t.rarity} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Sparkles} text="No properties set for this item." />
        ))}

      {tab === "Orders" &&
        (offers.length > 0 ? (
          <div className="space-y-2.5">
            {offers.map((o) => (
              <OfferRow key={o.id} offer={o} item={item} canAccept={isOwner && o.status === "active"} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Tag} text="No active offers yet — be the first to make one." />
        ))}

      {/* Chain-backed: our own records only cover Durchex trades, so a
          token minted or moved elsewhere would otherwise look inert. */}
      {tab === "Activity" && (
        <OnChainActivity itemId={item.id} activity={activity} chainId={item.chainId} />
      )}

      {tab === "Details" && (
        <div className="space-y-3">
          <DetailRow icon={Network} label="Chain" value={`Chain ID ${item.chainId}`} />
          <DetailRow
            icon={Link2}
            label="Contract address"
            value={item.contractAddress || "Not yet deployed"}
            mono
          />
          <DetailRow icon={Hash} label="Token ID" value={item.tokenId ?? "Not minted yet"} mono />
          <DetailRow icon={Sparkles} label="Metadata" value={item.metadataUri || "—"} mono />
        </div>
      )}
    </div>
  );
}

function OfferRow({
  offer,
  item,
  canAccept,
}: {
  offer: BidView;
  item: ItemDetailView;
  canAccept: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-8 h-8 rounded-full overflow-hidden shrink-0">
          <GeneratedArt seedKey={offer.bidder.address} className="w-full h-full" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-white truncate">{offer.bidder.username}</span>
            {offer.type === "auction_bid" ? (
              <Gavel className="w-3 h-3 text-purple-400 shrink-0" />
            ) : (
              <Tag className="w-3 h-3 text-purple-400 shrink-0" />
            )}
          </div>
          <div className="text-[11px] text-white/40">
            {offer.status === "accepted" ? "Accepted" : new Date(offer.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm font-semibold text-white tabular-nums">
          {offer.amountEth.toFixed(2)} ETH
        </span>
        {/* Auction bids settle through the auction flow, not the offers
            contract, so only plain offers get an accept action here. */}
        {canAccept && offer.type === "offer" && (
          <AcceptOfferButton
            prepareUrl={`/api/bids/${offer.id}/accept`}
            nftContract={item.contractAddress}
            chainId={item.chainId}
          />
        )}
        {offer.status === "accepted" && (
          <span className="text-xs text-success font-medium">Accepted</span>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Sparkles; text: string }) {
  return (
    <div className="flex flex-col items-center text-center py-10 text-white/40">
      <Icon className="w-8 h-8 mb-3 text-purple-500/40" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-white/5 last:border-0">
      <span className="flex items-center gap-2 text-sm text-white/50 shrink-0">
        <Icon className="w-4 h-4" />
        {label}
      </span>
      <span
        className={clsx(
          "text-sm text-white truncate text-right",
          mono && "font-mono text-xs text-white/70"
        )}
      >
        {value}
      </span>
    </div>
  );
}

