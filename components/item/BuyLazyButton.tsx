"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2, ExternalLink, Lock } from "lucide-react";
import { useAccount, useSwitchChain, useWriteContract, usePublicClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { useTxSuccess } from "@/components/tx/TxSuccess";
import { MARKETPLACE_ABI, marketplaceAddressFor } from "@/lib/web3/marketplaceAbi";
import {
  COLLECTION_FACTORY_ABI,
  collectionFactoryAddressFor,
  collectionImplementationAddressFor,
  collectionSalt,
  deriveCollectionSymbol,
} from "@/lib/web3/collectionFactory";
import { settlePurchase } from "@/lib/web3/settlePurchase";
import { explorerTxUrl } from "@/lib/web3/explorer";
import { PHASE_LABELS, PhaseKey } from "@/lib/mintPhases";
import { ItemDetailView } from "@/lib/types";

type Gate = { configured: boolean; eligiblePhases: PhaseKey[]; canMint: boolean; walletCapReached: boolean };

/**
 * The one real on-chain purchase path in the app: calls
 * DurchexMarketplace.buyLazy on a live deployment (see contracts/README.md).
 * Only rendered when the item's collection has a real contractAddress on a
 * chain the app knows about — every other item still shows the "not wired
 * up yet" notice in PricePanel instead of pretending to transact.
 *
 * If the collection has mint phases configured (GTD/FCFS/Public), this also
 * gates the button on eligibility. GTD/FCFS/Public can all be live at the
 * same time — they're not a sequence — so a wallet eligible for more than
 * one gets to pick which one to mint through; a collection that's never
 * touched phases mints exactly like before, unrestricted.
 */
export function BuyLazyButton({ item, phase: forcedPhase }: { item: ItemDetailView; phase?: PhaseKey }) {
  const router = useRouter();
  const { address, chainId: connectedChainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: item.chainId });
  const { celebrate } = useTxSuccess();

  const [txPhase, setTxPhase] = useState<"idle" | "switching" | "deploying" | "confirm" | "mining" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  // MintPanel owns the phase choice when it wraps this button; on its own
  // (no phase prop) the button still picks and offers phases itself.
  const [ownPhase, setOwnPhase] = useState<PhaseKey | null>(null);
  const selectedMintPhase = forcedPhase ?? ownPhase;
  const setSelectedMintPhase = setOwnPhase;

  useEffect(() => {
    if (!address) {
      const id = setTimeout(() => setGate(null), 0);
      return () => clearTimeout(id);
    }
    fetch(`/api/collections/${item.collectionId}/eligibility`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setGate(data.gate);
        // Same reasoning as BuyEditionButton: a phase this wallet has
        // exhausted is no longer a valid selection.
        setSelectedMintPhase((current) =>
          current && data.gate.eligiblePhases.includes(current)
            ? current
            : (data.gate.eligiblePhases[0] ?? null)
        );
      })
      .catch(() => setGate(null));
  }, [address, item.collectionId]);

  const marketplaceAddress = marketplaceAddressFor(item.chainId);
  if (!item.voucher || !marketplaceAddress) return null;
  const voucher = item.voucher;

  async function buy() {
    if (!address) {
      openConnectModal?.();
      return;
    }
    setError(null);
    try {
      if (connectedChainId !== item.chainId) {
        setTxPhase("switching");
        await switchChainAsync({ chainId: item.chainId });
      }

      // Collections created after DurchexCollectionFactory went live each
      // get their own contract instead of sharing DurchexNFT, so every
      // Durchex collection shows up as its own collection on external
      // marketplaces rather than merged into one. The clone only gets
      // deployed once someone actually buys — if that's this purchase,
      // deploy it first, then proceed to the mint exactly as before.
      if (item.standard === "ERC721" && item.contractType === "lazy") {
        const factoryAddress = collectionFactoryAddressFor(item.chainId);
        const implementationAddress = collectionImplementationAddressFor(item.chainId);
        if (factoryAddress && implementationAddress) {
          const code = await publicClient?.getBytecode({ address: item.contractAddress as `0x${string}` });
          if (!code || code === "0x") {
            setTxPhase("deploying");
            const deployHash = await writeContractAsync({
              address: factoryAddress,
              abi: COLLECTION_FACTORY_ABI,
              functionName: "deployCollection",
              args: [
                collectionSalt(item.collectionId),
                item.collectionName,
                deriveCollectionSymbol(item.collectionName),
                (item.creator?.address ?? voucher.creator) as `0x${string}`,
              ],
              chainId: item.chainId,
            });
            await publicClient?.waitForTransactionReceipt({ hash: deployHash });
          }
        }
      }

      setTxPhase("confirm");
      const hash = await writeContractAsync({
        address: marketplaceAddress!,
        abi: MARKETPLACE_ABI,
        functionName: "buyLazy",
        args: [
          item.contractAddress as `0x${string}`,
          {
            tokenId: BigInt(voucher.tokenId),
            uri: voucher.uri,
            minPrice: BigInt(voucher.minPrice),
            creator: voucher.creator as `0x${string}`,
            royaltyBps: BigInt(voucher.royaltyBps),
            nonce: BigInt(voucher.nonce),
            deadline: BigInt(voucher.deadline ?? 0),
          },
          voucher.signature as `0x${string}`,
        ],
        value: BigInt(voucher.minPrice),
        chainId: item.chainId,
      });
      setTxHash(hash);

      setTxPhase("mining");
      // Success is shown as soon as the receipt lands; the database sync
      // continues in the background. The buyer already owns the NFT at that
      // point, so making them watch our bookkeeping finish was pure
      // waiting. router.refresh() runs once the sync actually completes.
      await settlePurchase({
        publicClient,
        hash,
        chainId: item.chainId,
        onReceipt: () => setTxPhase("done"),
      });


      setTxPhase("done");
      celebrate({
        action: "mint",
        imageUrl: item.imageUrl,
        seedKey: item.id,
        subject: item.name,
        detail: `${item.priceEth} ETH`,
        txHash: hash,
        chainId: item.chainId,
        profileHref: address ? `/profile/${address}` : undefined,
      });
      setTimeout(() => router.refresh(), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Transaction failed");
      setTxPhase("idle");
    }
  }

  if (txPhase === "done") {
    return (
      // The celebration itself is the modal; this is just the quiet status
      // left behind on the page while ownership syncs.
      <div className="rounded-xl bg-success/10 border border-success/30 p-4 text-center">
        <p className="text-sm font-medium text-success mb-1">Purchased on-chain</p>
        <p className="text-xs text-white/40">Syncing ownership — refreshing…</p>
      </div>
    );
  }

  // Only block once we've actually checked (gate !== null) and it's a real
  // no — a wallet that hasn't connected yet, or hasn't loaded gate state,
  // still gets the normal button (clicking it prompts connect as usual).
  if (address && gate && gate.configured && !gate.canMint) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
        <Lock className="w-4 h-4 text-white/30 mx-auto mb-1.5" />
        {gate.walletCapReached ? (
          <>
            <p className="text-sm font-medium text-white/70">This wallet has already minted its limit</p>
            <p className="text-xs text-white/40 mt-1">You&apos;ve used up this wallet&apos;s per-wallet cap on every phase currently open.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-white/70">No mint phase this wallet is eligible for is open right now</p>
            <p className="text-xs text-white/40 mt-1">Check back once GTD, FCFS, or Public opens up.</p>
          </>
        )}
      </div>
    );
  }

  const showPhasePicker = !forcedPhase && address && gate?.configured && gate.eligiblePhases.length > 1;

  return (
    <div>
      {showPhasePicker && (
        <div className="flex gap-1.5 mb-2.5">
          {gate!.eligiblePhases.map((key) => (
            <button
              key={key}
              onClick={() => setSelectedMintPhase(key)}
              className={
                "flex-1 text-xs font-medium rounded-lg px-2.5 py-1.5 border transition " +
                (selectedMintPhase === key
                  ? "border-purple-500/60 bg-purple-700/20 text-white"
                  : "border-white/10 text-white/50 hover:border-white/20")
              }
            >
              {PHASE_LABELS[key]}
            </button>
          ))}
        </div>
      )}
      <Button
        size="lg"
        icon={txPhase === "idle" ? <Zap className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
        onClick={buy}
        disabled={txPhase !== "idle"}
      >
        {txPhase === "switching" && "Switch network in your wallet…"}
        {txPhase === "deploying" && "Setting up this collection's contract…"}
        {txPhase === "confirm" && "Confirm in your wallet…"}
        {txPhase === "mining" && "Minting on-chain…"}
        {txPhase === "idle" && "Buy & Mint (on-chain)"}
      </Button>
      {txHash && (
        <a
          href={explorerTxUrl(item.chainId, txHash) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition"
        >
          <ExternalLink className="w-3 h-3" />
          tx {txHash.slice(0, 10)}…{txHash.slice(-6)}
        </a>
      )}
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
