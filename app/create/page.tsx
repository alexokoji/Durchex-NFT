"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSignTypedData } from "wagmi";
import { isAddress } from "viem";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { StepIndicator } from "@/components/create/StepIndicator";
import { CollectionPicker, CollectionOption } from "@/components/create/CollectionPicker";
import { TraitsEditor, TraitInput } from "@/components/create/TraitsEditor";
import { PricingForm, PricingMode } from "@/components/create/PricingForm";
import { AssetUploader, UploadedAsset } from "@/components/create/AssetUploader";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { useSession } from "@/hooks/useSession";
import { buildVoucherTypedData } from "@/lib/web3/voucher";

const STEP_COUNT = 4;

export default function CreatePage() {
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();
  const { user } = useSession();
  const { signTypedDataAsync } = useSignTypedData();

  const [step, setStep] = useState(0);
  const [collection, setCollection] = useState<CollectionOption | null>(null);
  const [name, setName] = useState("");
  const [asset, setAsset] = useState<UploadedAsset | null>(null);
  const [description, setDescription] = useState("");
  const [traits, setTraits] = useState<TraitInput[]>([]);
  const [mode, setMode] = useState<PricingMode>("fixed_price");
  const [priceEth, setPriceEth] = useState("0.10");
  const [auctionDurationHours, setAuctionDurationHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canProceed = [
    !!collection && !!asset && name.trim().length >= 2,
    true,
    mode === "not_listed" || Number(priceEth) > 0,
    true,
  ][step];

  async function handleSubmit() {
    if (!collection || !address || !user || !asset) return;
    setSubmitting(true);
    setError(null);
    try {
      // Every collection defaults to the same shared DurchexNFT contract
      // (see lib/web3/deployedContract.ts), so tokenId has to be unique
      // across ALL collections, not just this one — a per-collection
      // counter like `collection.items + 1` would let two different
      // collections both try to mint tokenId 1 on the same contract.
      const tokenId = Date.now();
      const metadataUri = `${window.location.origin}/api/metadata/${collection.slug}/${tokenId}`;
      const canLazyMint = isAddress(collection.contractAddress) && chainId === collection.chainId;
      const typedData = canLazyMint ? buildVoucherTypedData({
        chainId: collection.chainId,
        verifyingContract: collection.contractAddress,
        tokenId,
        uri: metadataUri,
        priceEth: mode === "not_listed" ? 0 : Number(priceEth),
        creator: address,
        royaltyBps: collection.royaltyBps,
        nonce: user.nextVoucherNonce,
      }) : null;
      const signature = typedData ? await signTypedDataAsync(typedData) : undefined;

      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: collection.id,
          name,
          description,
          media: asset,
          traits,
          pricingMode: mode,
          priceEth: Number(priceEth),
          auctionDurationHours,
          tokenId: String(tokenId),
          metadataUri,
          voucher: typedData ? {
            tokenId: String(tokenId),
            uri: metadataUri,
            minPrice: typedData.message.minPrice.toString(),
            creator: address,
            royaltyBps: collection.royaltyBps,
            nonce: user.nextVoucherNonce,
          } : undefined,
          signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create listing");
      router.push(`/assets/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong signing your voucher");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-purple-500/30 text-xs font-medium text-purple-200">
        <Sparkles className="w-3.5 h-3.5" />
        Free to list — mints on first sale
      </div>
      <h1 className="font-display text-3xl font-semibold text-white mt-3 mb-8">Create an item</h1>

      <StepIndicator step={step} />

      <div className="surface-card p-6 sm:p-8 min-h-[22rem]">
        {step === 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Collection &amp; details</h2>
            <p className="text-sm text-white/45 mb-5">Pick a collection and describe your item.</p>
            <CollectionPicker selected={collection} onSelect={setCollection} />
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-white/50 mb-1.5 block">NFT asset <span className="text-purple-300">required</span></label>
                <AssetUploader value={asset} onChange={setAsset} />
              </div>
              <div>
                <label className="text-xs font-medium text-white/50 mb-1.5 block">Item name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Cosmic Wanderer #7"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-white/50 mb-1.5 block">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Tell collectors what makes this piece one of a kind."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60 resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Properties</h2>
            <p className="text-sm text-white/45 mb-5">
              Add traits like Background or Aura — buyers can filter by these.
            </p>
            <TraitsEditor traits={traits} onChange={setTraits} />
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Pricing</h2>
            <p className="text-sm text-white/45 mb-5">
              This item won&apos;t mint on-chain until it sells — listing is free.
            </p>
            <PricingForm
              mode={mode}
              onModeChange={setMode}
              priceEth={priceEth}
              onPriceChange={setPriceEth}
              auctionDurationHours={auctionDurationHours}
              onDurationChange={setAuctionDurationHours}
            />
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Review &amp; sign</h2>
            <p className="text-sm text-white/45 mb-5">
              Signing costs no gas — it&apos;s an off-chain EIP-712 voucher. The item only mints
              on-chain when someone buys it.
            </p>

            <div className="flex gap-4 mb-6">
              <div className="w-28 h-28 rounded-xl overflow-hidden shrink-0 surface-card bg-black">
                {asset?.type.startsWith("video/") ? <video src={asset.url} className="w-full h-full object-cover" /> : asset?.type.startsWith("audio/") ? <div className="h-full grid place-items-center text-purple-300">♫</div> : asset ? <img src={asset.url} alt="NFT preview" className="w-full h-full object-cover" /> : <GeneratedArt seedKey={name || "preview"} className="w-full h-full" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-purple-300 mb-1">
                  {collection && <CategoryIcon category={collection.category} size={16} />}
                  {collection?.name}
                </div>
                <div className="font-semibold text-white truncate">{name || "Untitled item"}</div>
                <div className="text-sm text-white/50 mt-1">
                  {mode === "not_listed"
                    ? "Not listed yet"
                    : `${mode === "auction" ? "Starting at" : "Price"}: ${priceEth || "0"} ETH`}
                </div>
                {traits.filter((t) => t.traitType && t.value).length > 0 && (
                  <div className="text-xs text-white/40 mt-1">
                    {traits.filter((t) => t.traitType && t.value).length} properties
                  </div>
                )}
              </div>
            </div>

            {!isConnected || !user ? (
              <div className="flex flex-col items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                <p className="text-sm text-white/60">Connect and sign in to sign your listing.</p>
                <ConnectWalletButton />
              </div>
            ) : (
              <>
                {(!collection?.contractAddress || !isAddress(collection.contractAddress) || chainId !== collection.chainId) && (
                  <div className="mb-4 p-3 rounded-xl bg-amber-400/10 border border-amber-300/20 text-xs text-amber-100">
                    This collection is not connected to a deployed contract on your active network. Your media and metadata will be saved as a draft; deploy or attach the collection contract before enabling lazy-mint listings.
                  </div>
                )}
              <Button size="lg" onClick={handleSubmit} disabled={submitting || !collection || !asset}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Confirm in your wallet…
                  </>
                ) : (
                  collection?.contractAddress && isAddress(collection.contractAddress) && chainId === collection.chainId ? "Sign & List" : "Save NFT draft"
                )}
              </Button>
              </>
            )}
            {error && <p className="text-xs text-danger mt-3">{error}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-6">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="w-3.5 h-3.5" />}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className={step === 0 ? "opacity-0 pointer-events-none" : ""}
        >
          Back
        </Button>
        {step < STEP_COUNT - 1 && (
          <Button
            size="sm"
            icon={<ArrowRight className="w-3.5 h-3.5" />}
            onClick={() => setStep((s) => Math.min(STEP_COUNT - 1, s + 1))}
            disabled={!canProceed}
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
