"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { SUPPORTED_EVM_CHAIN_IDS } from "@/lib/web3/supportedChains";

const CHAIN_LABELS: Record<number, string> = {
  1: "Ethereum Mainnet",
  8453: "Base",
  137: "Polygon",
  42161: "Arbitrum",
  10: "Optimism",
  43114: "Avalanche",
  56: "BNB Chain",
  999: "Hyperliquid",
  11155111: "Ethereum Sepolia",
};

export function ContractAttach({
  collectionId,
  creatorAddress,
  contractAddress,
  chainId,
}: {
  collectionId: string;
  creatorAddress: string | null;
  contractAddress: string;
  chainId: number;
}) {
  const { user } = useSession();
  const [address, setAddress] = useState(contractAddress);
  const [chain, setChain] = useState(chainId || 11155111);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const isOwner = !!user && !!creatorAddress && user.address.toLowerCase() === creatorAddress.toLowerCase();

  if (!isOwner) return null;

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/collections/${collectionId}/contract`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractAddress: address, chainId: chain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to attach contract");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach contract");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surface-card p-5 mt-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-1">
        <Link2 className="w-4 h-4 text-purple-300" /> Attach deployed contract
      </div>
      <p className="text-xs text-white/45 mb-3">
        Point this collection at a real deployed <code>DurchexNFT</code> so &ldquo;Buy &amp; Mint&rdquo; goes
        live for unminted items in it.
      </p>
      <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x… deployed DurchexNFT address"
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white font-mono"
        />
        <select
          value={chain}
          onChange={(e) => setChain(Number(e.target.value))}
          className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
        >
          {SUPPORTED_EVM_CHAIN_IDS.map((id) => (
            <option key={id} value={id} className="bg-void">
              {CHAIN_LABELS[id] ?? id}
            </option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={saving}
          className="text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 transition disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
      {error && <p className="text-[11px] text-danger mt-1.5">{error}</p>}
    </div>
  );
}
