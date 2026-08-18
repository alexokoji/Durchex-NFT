"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tag, Loader2, X, Info } from "lucide-react";
import { useAccount, useSwitchChain, useSignTypedData, useReadContract, useWriteContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseEther } from "viem";
import { Button } from "@/components/ui/Button";
import { useTxSuccess } from "@/components/tx/TxSuccess";
import {
  buildCollectionOfferTypedData,
  generateOfferNonce,
  offersAddressFor,
  wethAddressFor,
  ERC20_ABI,
} from "@/lib/web3/offerCriteria";
import { CollectionDetailView } from "@/lib/types";

const EXPIRY_OPTIONS = [
  { label: "24 hours", seconds: 24 * 60 * 60 },
  { label: "48 hours", seconds: 48 * 60 * 60 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { label: "30 days", seconds: 30 * 24 * 60 * 60 },
];

/**
 * A collection offer is a standing bid on *any eligible NFT* in the
 * collection, not on one specific item. It settles in WETH rather than
 * ETH: the seller is the one who submits the accepting transaction, so the
 * buyer isn't present to send value — the contract pulls pre-approved WETH
 * from them instead.
 */
export function MakeCollectionOfferButton({ collection }: { collection: CollectionDetailView }) {
  const router = useRouter();
  const { address, chainId: connectedChainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  const [open, setOpen] = useState(false);
  const [pricePerItem, setPricePerItem] = useState("");
  const { celebrate } = useTxSuccess();
  const [quantity, setQuantity] = useState("1");
  const [expirySeconds, setExpirySeconds] = useState(EXPIRY_OPTIONS[1].seconds);
  const [phase, setPhase] = useState<"idle" | "switching" | "approving" | "signing" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  // Trait criteria: narrowing the eligible set is all a "criteria offer"
  // is, so this reuses the same merkle-root machinery as an open offer.
  type TraitGroup = { traitType: string; values: { value: string; count: number }[] };
  const [traits, setTraits] = useState<TraitGroup[]>([]);
  const [traitType, setTraitType] = useState("");
  const [traitValues, setTraitValues] = useState<string[]>([]);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);

  const criteria = traitType && traitValues.length ? { traitType, values: traitValues } : null;

  useEffect(() => {
    if (!open) return;
    fetch(`/api/collections/${collection.id}/traits`)
      .then((r) => (r.ok ? r.json() : { traits: [] }))
      .then((d) => setTraits(d.traits ?? []));
  }, [open, collection.id]);

  // Keep the "how many NFTs could fill this" figure honest as the buyer
  // adjusts criteria — it's the clearest signal of what they're committing to.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/collections/${collection.id}/offers/criteria-root`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ criteria }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setEligibleCount(d?.eligibleCount ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, collection.id, traitType, traitValues.join(",")]);

  const offersAddress = offersAddressFor(collection.chainId);
  const weth = wethAddressFor(collection.chainId);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: weth,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && offersAddress ? [address, offersAddress] : undefined,
    chainId: collection.chainId,
    query: { enabled: !!address && !!offersAddress && !!weth },
  });

  const total = (Number(pricePerItem) || 0) * (Number(quantity) || 0);
  const totalWei = total > 0 ? parseEther(total.toString()) : BigInt(0);
  const needsApproval = allowance !== undefined && totalWei > 0 && (allowance as bigint) < totalWei;

  // Offers can't be made until the settlement contract is live on this chain.
  if (!offersAddress || !weth) return null;

  async function submit() {
    if (!address) return openConnectModal?.();
    const price = Number(pricePerItem);
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(price) || price <= 0) return setError("Enter a valid price per NFT");
    if (!Number.isFinite(qty) || qty <= 0) return setError("Enter a valid quantity");

    setError(null);
    try {
      if (connectedChainId !== collection.chainId) {
        setPhase("switching");
        await switchChainAsync({ chainId: collection.chainId });
      }

      if (needsApproval) {
        setPhase("approving");
        await writeContractAsync({
          address: weth!,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [offersAddress!, totalWei],
          chainId: collection.chainId,
        });
        await new Promise((r) => setTimeout(r, 2000));
        await refetchAllowance();
      }

      // The eligible set (and therefore the merkle root the offer commits
      // to) is derived server-side from real collection data — asking for
      // it here keeps the client from being able to widen its own offer.
      setPhase("signing");
      const rootRes = await fetch(`/api/collections/${collection.id}/offers/criteria-root`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria }),
      });
      const rootData = await rootRes.json();
      if (!rootRes.ok) throw new Error(rootData.error ?? "Couldn't prepare the offer");

      const nonce = generateOfferNonce();
      const typedData = buildCollectionOfferTypedData({
        chainId: collection.chainId,
        verifyingContract: offersAddress!,
        nft: collection.contractAddress,
        isERC1155: collection.standard === "ERC1155",
        criteriaRoot: rootData.criteriaRoot,
        pricePerItemEth: price,
        quantity: qty,
        deadlineSeconds: expirySeconds,
        nonce,
        buyer: address as `0x${string}`,
      });
      const signature = await signTypedDataAsync(typedData);

      setPhase("saving");
      const res = await fetch(`/api/collections/${collection.id}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pricePerItemEth: price,
          quantity: qty,
          criteria,
          criteriaRoot: rootData.criteriaRoot,
          nonce: nonce.toString(),
          deadline: typedData.message.deadline.toString(),
          signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit offer");

      setPhase("idle");
      setOpen(false);
      celebrate({
        action: "offer",
        imageUrl: collection.logoUrl || null,
        seedKey: `logo-${collection.slug}`,
        subject: collection.name,
        detail: `${qty} × ${price} WETH`,
        secondary: { label: "View collection", href: `/collection/${collection.slug}` },
      });
      setPricePerItem("");
      setQuantity("1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Failed to submit offer");
      setPhase("idle");
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} icon={<Tag className="w-4 h-4" />}>
        Make Collection Offer
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={() => setOpen(false)}>
          <div className="surface-card p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <h2 className="font-display text-xl font-semibold text-white">Make Collection Offer</h2>
              <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-white/45 mb-4">
              An offer on <span className="text-white/70">{collection.name}</span> as a whole — any eligible NFT in
              the collection can be sold to you at this price, not one specific item.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-white/50 mb-1.5 block">Offer per NFT (WETH)</label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={pricePerItem}
                  onChange={(e) => setPricePerItem(e.target.value)}
                  placeholder="0.40"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-white/50 mb-1.5 block">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/60"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-white/50 mb-1.5 block">Expires in</label>
                  <select
                    value={expirySeconds}
                    onChange={(e) => setExpirySeconds(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/60"
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={o.seconds} value={o.seconds} className="bg-surface-1">
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {traits.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-white/50 mb-1.5 block">
                    Trait criteria <span className="text-white/30">(optional)</span>
                  </label>
                  <select
                    value={traitType}
                    onChange={(e) => {
                      setTraitType(e.target.value);
                      setTraitValues([]);
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/60"
                  >
                    <option value="" className="bg-surface-1">
                      Any NFT in the collection
                    </option>
                    {traits.map((t) => (
                      <option key={t.traitType} value={t.traitType} className="bg-surface-1">
                        {t.traitType}
                      </option>
                    ))}
                  </select>

                  {traitType && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {traits
                        .find((t) => t.traitType === traitType)
                        ?.values.map((v) => {
                          const selected = traitValues.includes(v.value);
                          return (
                            <button
                              key={v.value}
                              type="button"
                              onClick={() =>
                                setTraitValues((cur) =>
                                  selected ? cur.filter((x) => x !== v.value) : [...cur, v.value]
                                )
                              }
                              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                                selected
                                  ? "border-purple-400 bg-purple-500/15 text-purple-100"
                                  : "border-white/10 text-white/50 hover:border-white/25"
                              }`}
                            >
                              {v.value} <span className="text-white/30">{v.count}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                  {traitType && traitValues.length === 0 && (
                    <p className="text-[10px] text-white/30 mt-1.5">
                      Pick at least one value, or the offer stays open to the whole collection.
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/45 text-xs">Total maximum</span>
                  <span className="text-white font-semibold tabular-nums">{total.toFixed(3)} WETH</span>
                </div>
                {eligibleCount !== null && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/40">Eligible NFTs</span>
                    <span className="text-white/60 tabular-nums">
                      {eligibleCount}
                      {criteria ? ` matching ${criteria.traitType}` : " in collection"}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 text-[11px] text-white/45 bg-white/5 border border-white/10 rounded-lg p-3">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-purple-300" />
                <span>
                  Paid in WETH, because the seller submits the accepting transaction and you won&rsquo;t be there to
                  send ETH. You keep the WETH until someone accepts — only the amount actually filled is ever taken.
                </span>
              </div>

              {error && <p className="text-xs text-danger">{error}</p>}

              <Button
                className="w-full"
                onClick={submit}
                disabled={phase !== "idle"}
                icon={phase !== "idle" ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
              >
                {phase === "switching" && "Switch network…"}
                {phase === "approving" && "Approve WETH in wallet…"}
                {phase === "signing" && "Sign offer in wallet…"}
                {phase === "saving" && "Submitting…"}
                {phase === "idle" && (needsApproval ? "Approve & Submit Offer" : "Submit Collection Offer")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
