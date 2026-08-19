import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { connectDB } from "@/lib/db";
import { PlatformSettings } from "@/lib/models/PlatformSettings";
import { marketplaceAddressFor } from "@/lib/web3/marketplaceAbi";
import { DEFAULT_NFT_CHAIN_ID } from "@/lib/web3/deployedContract";

// The platform fee lives on-chain and is adjustable by the contract owner
// (bounded by an immutable ceiling), so it's read live rather than
// hardcoded — a stale copy here would misreport what buyers actually pay.
const FEE_ABI = [
  { type: "function", name: "platformFeeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint96" }] },
  { type: "function", name: "MAX_PLATFORM_FEE_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint96" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
] as const;

// Mirrors DurchexNFT.MAX_ROYALTY_BPS — the contract rejects any voucher
// above this, so the app must never let an admin configure a higher cap.
const CONTRACT_MAX_ROYALTY_BPS = 3000;

async function readOnChainFee() {
  const chainId = DEFAULT_NFT_CHAIN_ID;
  const address = marketplaceAddressFor(chainId);
  if (!address) return null;
  try {
    const client = createPublicClient({
      chain: chainId === 1 ? mainnet : sepolia,
      transport: http(),
    });
    const [platformFeeBps, maxPlatformFeeBps, paused] = await Promise.all([
      client.readContract({ address, abi: FEE_ABI, functionName: "platformFeeBps" }),
      client.readContract({ address, abi: FEE_ABI, functionName: "MAX_PLATFORM_FEE_BPS" }),
      client.readContract({ address, abi: FEE_ABI, functionName: "paused" }),
    ]);
    return {
      platformFeeBps: Number(platformFeeBps),
      maxPlatformFeeBps: Number(maxPlatformFeeBps),
      paused,
      marketplaceAddress: address,
      chainId,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  await connectDB();
  let settings = await PlatformSettings.findOne();
  if (!settings) settings = await PlatformSettings.create({});
  const onChain = await readOnChainFee();
  return NextResponse.json({
    royaltyCapBps: settings.royaltyCapBps,
    contractMaxRoyaltyBps: CONTRACT_MAX_ROYALTY_BPS,
    creationEnabled: settings.creationEnabled !== false,
    creationAllowlist: settings.creationAllowlist ?? [],
    onChain,
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if ("royaltyCapBps" in body) {
    const royaltyCapBps = Number(body.royaltyCapBps);
    if (!Number.isFinite(royaltyCapBps) || royaltyCapBps < 0 || royaltyCapBps > CONTRACT_MAX_ROYALTY_BPS) {
      return NextResponse.json(
        { error: `royaltyCapBps must be between 0 and ${CONTRACT_MAX_ROYALTY_BPS} (the on-chain limit)` },
        { status: 400 }
      );
    }
    update.royaltyCapBps = royaltyCapBps;
  }

  if ("creationEnabled" in body) update.creationEnabled = !!body.creationEnabled;

  if ("creationAllowlist" in body) {
    const raw: unknown = body.creationAllowlist;
    const entries = Array.isArray(raw) ? raw : String(raw ?? "").split(/[\s,]+/);
    const addresses = entries.map((a) => String(a).trim().toLowerCase()).filter(Boolean);
    const invalid = addresses.find((a) => !/^0x[a-f0-9]{40}$/.test(a));
    if (invalid) {
      return NextResponse.json({ error: `"${invalid}" isn't a valid wallet address.` }, { status: 400 });
    }
    update.creationAllowlist = [...new Set(addresses)];
  }

  await connectDB();
  const settings = await PlatformSettings.findOneAndUpdate({}, update, { new: true, upsert: true });
  const onChain = await readOnChainFee();
  return NextResponse.json({
    royaltyCapBps: settings.royaltyCapBps,
    contractMaxRoyaltyBps: CONTRACT_MAX_ROYALTY_BPS,
    creationEnabled: settings.creationEnabled !== false,
    creationAllowlist: settings.creationAllowlist ?? [],
    onChain,
  });
}
