"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSignTypedData } from "wagmi";
import { isAddress } from "viem";
import { upload } from "@vercel/blob/client";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CollectionOption } from "@/components/create/CollectionPicker";
import { buildVoucherTypedData } from "@/lib/web3/voucher";
import { parseBulkFile, computeTraitRarity, type BulkDraft, type BulkParseResult } from "@/lib/bulkImport";

type Uploaded = { url: string; type: string; name: string; size: number };

/**
 * Creating many items from a spreadsheet and a folder of images.
 *
 * The signing is the honest constraint here and the UI says so rather than
 * hiding it: a lazy-mint voucher is signed per item, so a batch of twenty
 * is twenty wallet prompts. That is what OpenSea did for years and it is
 * fine at this size — but it is why this tool is presented for tens of
 * items, not thousands. A thousand-piece collection wants a drop contract
 * with a baseURI and no vouchers at all.
 *
 * Items are signed and posted one at a time rather than all signed up
 * front. Voucher nonces are sequential and the API checks each against a
 * freshly computed expectation, so a failure partway through a pre-signed
 * batch would invalidate every signature after it. Doing them in step
 * means a failure costs exactly one item and the rest can resume.
 */
export function BulkImport({ collection }: { collection: CollectionOption }) {
  const router = useRouter();
  const { address, chainId } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const metaInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<BulkParseResult | null>(null);
  const [images, setImages] = useState<Record<string, Uploaded>>({});
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [created, setCreated] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const isEdition = collection.standard === "ERC1155";
  const drafts = parsed?.drafts ?? [];
  const matched = drafts.filter((d) => images[d.image.toLowerCase()]);
  const missing = drafts.filter((d) => !images[d.image.toLowerCase()]);
  const ready = matched.length > 0 && missing.length === 0 && !running;

  async function readMetadata(file: File) {
    setError(null);
    const text = await file.text();
    const result = parseBulkFile(file.name, text);
    setParsed(result);
    setCreated(0);
    setFinished(false);
  }

  async function uploadImages(files: FileList) {
    setError(null);
    setUploading({ done: 0, total: files.length });
    const next: Record<string, Uploaded> = { ...images };
    let done = 0;
    for (const file of Array.from(files)) {
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const blob = await upload(`nft-assets/${Date.now()}-${safeName}`, file, {
          access: "public",
          handleUploadUrl: "/api/uploads",
          multipart: file.size > 4 * 1024 * 1024,
        });
        // Matched on filename, case-insensitively — a metadata file written
        // by hand rarely agrees with the filesystem on capitalisation.
        next[file.name.toLowerCase()] = { url: blob.url, type: file.type, name: file.name, size: file.size };
      } catch {
        setError(`Couldn't upload ${file.name}. The rest were kept — try that one again.`);
      }
      done += 1;
      setUploading({ done, total: files.length });
    }
    setImages(next);
    setUploading(null);
  }

  async function createAll() {
    if (!address) return setError("Connect your wallet first.");
    if (isEdition) return setError("Bulk import currently handles ERC-721 collections.");
    setRunning(true);
    setError(null);

    const rarity = computeTraitRarity(matched);
    const canLazyMint = isAddress(collection.contractAddress) && chainId === collection.chainId;
    if (!canLazyMint) {
      setRunning(false);
      return setError(
        `Switch your wallet to ${collection.chainId === 1 ? "Ethereum" : `chain ${collection.chainId}`} — vouchers are signed against that network.`
      );
    }

    try {
      for (let i = created; i < matched.length; i += 1) {
        const draft = matched[i];
        const media = images[draft.image.toLowerCase()];

        // Re-read the nonce each time rather than predicting the sequence.
        // The API compares it for exact equality against a freshly derived
        // value, so a prediction that drifts by one fails every remaining
        // item; asking costs a round trip and cannot drift.
        const nonceRes = await fetch(`/api/collections/${collection.id}/voucher-nonce`);
        const nonceData = await nonceRes.json();
        if (!nonceRes.ok) throw new Error(nonceData.error ?? "Couldn't read the voucher nonce");

        // Millisecond timestamps collide when a loop runs faster than the
        // clock ticks, and tokenId must be unique across every collection
        // on the shared contract — so the index is folded in.
        const tokenId = Date.now() * 1000 + i;
        const metadataUri = `${window.location.origin}/api/metadata/${collection.slug}/${tokenId}`;

        const typedData = buildVoucherTypedData({
          chainId: collection.chainId,
          verifyingContract: collection.contractAddress,
          tokenId,
          uri: metadataUri,
          priceEth: draft.priceEth,
          creator: address,
          royaltyBps: collection.royaltyBps,
          nonce: nonceData.nonce,
        });
        const signature = await signTypedDataAsync(typedData);

        const res = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collectionId: collection.id,
            name: draft.name,
            description: draft.description,
            media,
            // Rarity can only be known across a whole batch, which is why
            // the one-at-a-time flow never filled this in.
            traits: draft.traits.map((t) => ({
              ...t,
              rarity: rarity.get(`${t.trait_type}:${t.value}`) ?? null,
            })),
            pricingMode: draft.priceEth > 0 ? "fixed_price" : "not_listed",
            priceEth: draft.priceEth,
            tokenId: String(tokenId),
            metadataUri,
            voucher: {
              tokenId: String(tokenId),
              uri: metadataUri,
              minPrice: typedData.message.minPrice.toString(),
              creator: address,
              royaltyBps: collection.royaltyBps,
              nonce: nonceData.nonce,
              deadline: typedData.message.deadline.toString(),
            },
            signature,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Row ${draft.row} (${draft.name}) failed`);
        setCreated(i + 1);
      }
      setFinished(true);
      router.refresh();
    } catch (err) {
      // Stops where it stopped. Everything already created is real and
      // stays; pressing the button again resumes from the failure.
      setError(err instanceof Error ? err.message : "Bulk import stopped");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm text-white/70">
          Upload a CSV or JSON file describing your items, plus the images they refer to.
        </p>
        <p className="text-xs text-white/40 mt-1.5">
          Each item is signed separately, so a batch of 20 means 20 wallet prompts. Best for tens of
          items — for a full PFP collection, a drop contract is the right tool.
        </p>
      </div>

      <Formats />

      <div className="grid sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => metaInput.current?.click()}
          className="rounded-xl border-2 border-dashed border-white/15 hover:border-purple-500/60 bg-white/[0.02] transition p-5 text-center"
        >
          <FileSpreadsheet className="w-6 h-6 text-purple-300 mx-auto mb-2" />
          <span className="block text-sm font-semibold text-white">
            {parsed ? `${drafts.length} items read` : "Choose CSV or JSON"}
          </span>
          <span className="block text-xs text-white/40 mt-1">.csv or .json</span>
        </button>
        <input
          ref={metaInput}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && readMetadata(e.target.files[0])}
        />

        <button
          type="button"
          onClick={() => imageInput.current?.click()}
          disabled={!!uploading}
          className="rounded-xl border-2 border-dashed border-white/15 hover:border-purple-500/60 bg-white/[0.02] transition p-5 text-center disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="w-6 h-6 text-purple-300 mx-auto mb-2 animate-spin" />
          ) : (
            <ImagePlus className="w-6 h-6 text-purple-300 mx-auto mb-2" />
          )}
          <span className="block text-sm font-semibold text-white">
            {uploading
              ? `Uploading ${uploading.done}/${uploading.total}`
              : Object.keys(images).length > 0
                ? `${Object.keys(images).length} images ready`
                : "Choose images"}
          </span>
          <span className="block text-xs text-white/40 mt-1">Select all of them at once</span>
        </button>
        <input
          ref={imageInput}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="hidden"
          onChange={(e) => e.target.files?.length && uploadImages(e.target.files)}
        />
      </div>

      {parsed && parsed.errors.length > 0 && (
        <Notice tone="danger" icon={AlertTriangle} title={`${parsed.errors.length} rows couldn't be read`}>
          <ul className="mt-1.5 space-y-0.5">
            {parsed.errors.slice(0, 6).map((e) => (
              <li key={e.row}>Row {e.row}: {e.message}</li>
            ))}
            {parsed.errors.length > 6 && <li>…and {parsed.errors.length - 6} more.</li>}
          </ul>
        </Notice>
      )}

      {missing.length > 0 && (
        <Notice tone="warn" icon={AlertTriangle} title={`${missing.length} items have no matching image`}>
          <p className="mt-1">
            Add {missing.slice(0, 4).map((d) => d.image).join(", ")}
            {missing.length > 4 ? `, and ${missing.length - 4} more` : ""}.
          </p>
        </Notice>
      )}

      {matched.length > 0 && <Preview drafts={matched} images={images} />}

      {error && <Notice tone="danger" icon={AlertTriangle} title="Import stopped">{error}</Notice>}

      {finished && (
        <Notice tone="success" icon={CheckCircle2} title={`Created ${created} items`}>
          They're live in {collection.name}.
        </Notice>
      )}

      <Button onClick={createAll} disabled={!ready} className="w-full">
        {running ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Signing {created + 1} of {matched.length} — approve in your wallet
          </>
        ) : created > 0 && !finished ? (
          `Resume from item ${created + 1} of ${matched.length}`
        ) : (
          `Create ${matched.length || ""} items`
        )}
      </Button>
      {created > 0 && !finished && !running && (
        <p className="text-xs text-white/45 text-center">
          {created} already created and kept — resuming won't duplicate them.
        </p>
      )}
    </div>
  );
}

function Preview({ drafts, images }: { drafts: BulkDraft[]; images: Record<string, Uploaded> }) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/8 text-[11px] uppercase tracking-wide text-white/35">
        {drafts.length} ready to create
      </div>
      <div className="max-h-72 overflow-y-auto">
        {drafts.map((d) => (
          <div key={d.row} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0">
            <img
              src={images[d.image.toLowerCase()]?.url}
              alt=""
              className="w-9 h-9 rounded-lg object-cover bg-black shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white truncate">{d.name}</p>
              <p className="text-[11px] text-white/40 truncate">
                {d.traits.length > 0 ? d.traits.map((t) => `${t.trait_type}: ${t.value}`).join(" · ") : "No traits"}
              </p>
            </div>
            <span className="text-sm tabular-nums text-white/70 shrink-0">
              {d.priceEth > 0 ? `${d.priceEth} ETH` : "Not listed"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Formats() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-white/60 hover:text-white transition"
      >
        What should the file look like?
        <span className="text-white/30">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-[11px]">
          <div>
            <p className="text-white/50 mb-1">CSV — one row per item, trait columns named <code>trait:Name</code>:</p>
            <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 text-white/70">{`name,description,price,image,trait:Background,trait:Eyes
Sword #1,"A sharp, curved blade",0.05,sword1.png,Blue,Green
Sword #2,A blunt one,0.05,sword2.png,Red,Gold`}</pre>
          </div>
          <div>
            <p className="text-white/50 mb-1">
              JSON — the standard metadata shape, so a generator&apos;s output works unchanged:
            </p>
            <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 text-white/70">{`[
  { "name": "Sword #1", "description": "A sharp one",
    "image": "sword1.png", "price": 0.05,
    "attributes": [{ "trait_type": "Background", "value": "Blue" }] }
]`}</pre>
          </div>
          <p className="text-white/40">
            <code>image</code> is matched to your uploaded files by filename. A price of 0 creates the
            item without listing it. Trait rarity is worked out across the whole batch.
          </p>
        </div>
      )}
    </div>
  );
}

function Notice({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "danger" | "warn" | "success";
  icon: typeof AlertTriangle;
  title: string;
  children: React.ReactNode;
}) {
  const tones = {
    danger: "border-danger/30 bg-danger/10 text-danger",
    warn: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    success: "border-success/30 bg-success/10 text-success",
  };
  return (
    <div className={`rounded-xl border p-3 text-xs ${tones[tone]}`}>
      <p className="flex items-center gap-1.5 font-medium">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {title}
      </p>
      <div className="text-white/60 mt-0.5">{children}</div>
    </div>
  );
}
