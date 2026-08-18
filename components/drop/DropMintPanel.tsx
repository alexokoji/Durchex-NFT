"use client";

import { useEffect, useState } from "react";
import { parseEther, isAddress } from "viem";
import { useAccount, useSwitchChain, useWriteContract, usePublicClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useTxSuccess } from "@/components/tx/TxSuccess";
import { DROP_ABI } from "@/lib/web3/dropAbi";
import { isPhaseLive } from "@/lib/mintPhases";

export type DropMintConfig = {
  collectionId?: string;
  contractAddress: string;
  chainId: number;
  phases: { whitelist: MintPhase; og: MintPhase; public: MintPhase };
};
export type MintPhase = {
  enabled: boolean;
  priceEth: number;
  allocation: number;
  walletLimit: number;
  startsAt?: string | null;
  endsAt?: string | null;
  proof?: `0x${string}`[];
};

const ORDER = [
  { key: "whitelist", label: "GTD", value: 0 },
  { key: "og", label: "FCFS", value: 1 },
  { key: "public", label: "Public", value: 2 },
] as const;

export function DropMintPanel({ drop }: { drop: DropMintConfig }) {
  const { address, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId: drop.chainId });
  const { celebrate } = useTxSuccess();
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState<"idle" | "switching" | "confirming" | "mining" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [proofs, setProofs] = useState<Record<string, `0x${string}`[]>>({});
  const active = ORDER.find(({ key }) => isPhaseLive(drop.phases[key]));

  useEffect(() => {
    if (!address || !drop.collectionId) return;
    fetch(`/api/collections/${drop.collectionId}/eligibility`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data && setProofs({ whitelist: data.whitelist?.proof ?? [], og: data.og?.proof ?? [] }))
      .catch(() => {});
  }, [address, drop]);

  if (!isAddress(drop.contractAddress) || !active) return null;
  const selected = active;
  const phase = drop.phases[selected.key];
  const total = phase.priceEth * quantity;

  async function mint() {
    if (!address) return openConnectModal?.();
    setError(null);
    try {
      if (chainId !== drop.chainId) { setState("switching"); await switchChainAsync({ chainId: drop.chainId }); }
      setState("confirming");
      const hash = await writeContractAsync({ address: drop.contractAddress as `0x${string}`, abi: DROP_ABI, functionName: "mint", args: [selected.value, BigInt(quantity), selected.key === "public" ? [] : proofs[selected.key] ?? phase.proof ?? []], value: parseEther(total.toString()), chainId: drop.chainId });
      setState("mining");
      await client?.waitForTransactionReceipt({ hash });
      if (drop.collectionId) {
        await fetch(`/api/collections/${drop.collectionId}/phases/${selected.key}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity }),
        }).catch(() => {});
      }
      setState("done");
      celebrate({
        action: "mint",
        seedKey: drop.contractAddress,
        subject: `${quantity} NFT${quantity > 1 ? "s" : ""}`,
        detail: `${total.toFixed(4)} ETH · ${selected.label} phase`,
        txHash: hash,
        chainId: drop.chainId,
        profileHref: address ? `/profile/${address}` : undefined,
      });
    } catch (err) { setError(err instanceof Error ? err.message.split("\n")[0] : "Mint failed"); setState("idle"); }
  }

  return <div className="surface-card p-5 mt-8"><div className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="w-4 h-4 text-purple-300" /> Mint this drop</div><p className="text-xs text-white/45 mt-1">{active.label} phase · {phase.walletLimit ? `${phase.walletLimit} per wallet` : "No wallet limit"}</p><div className="flex gap-2 mt-4"><input type="number" min="1" max={phase.walletLimit || undefined} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" /><Button onClick={mint} disabled={state !== "idle"} className="flex-1" icon={state === "idle" ? <Sparkles className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}>{state === "switching" ? "Switch network…" : state === "confirming" ? "Confirm in wallet…" : state === "mining" ? "Minting…" : state === "done" ? "Minted" : `${total.toFixed(4)} ETH · Mint`}</Button></div>{phase.allocation > 0 && <p className="text-[11px] text-white/35 mt-3">Phase allocation: {phase.allocation.toLocaleString()} NFTs</p>}{error && <p className="text-xs text-danger mt-3">{error}</p>}</div>;
}
