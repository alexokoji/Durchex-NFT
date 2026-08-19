import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet, sepolia, type Chain } from "viem/chains";
import { connectDB } from "@/lib/db";
import { Activity } from "@/lib/models/Activity";
import { verifyAndSyncPurchase } from "@/lib/web3/verifyPurchase";
import { marketplaceAddressFor } from "@/lib/web3/marketplaceAbi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Catches sales the app never recorded.
 *
 * Ownership is normally synced by the buyer's own browser calling
 * /api/purchases/confirm right after their transaction mines. That works
 * until it doesn't: a closed tab, a failed request, or a wallet that
 * navigates away mid-flow all leave a real, paid-for purchase invisible on
 * the platform while being perfectly valid on-chain. It has happened three
 * times, needing a manual replay each time.
 *
 * So the chain is treated as the source of truth on a schedule: every sale
 * event the marketplace emitted in the recent past is checked against our
 * own Activity records, and anything missing is replayed through exactly
 * the same verified path a browser would have used. Re-running is safe —
 * the sync handlers are idempotent, so an already-recorded sale is a no-op.
 */
const CHAINS: Record<number, Chain> = { 1: mainnet, 11155111: sepolia };

const SALE_EVENTS = parseAbi([
  "event VoucherRedeemed(address indexed nft, uint256 indexed tokenId, address buyer, uint256 price)",
  "event ListingFilled(address indexed nft, uint256 indexed tokenId, address seller, address buyer, uint256 price)",
  "event EditionRedeemed(address indexed nft, uint256 indexed tokenId, address buyer, uint256 quantity, uint256 totalPrice)",
  "event Listing1155Filled(address indexed nft, uint256 indexed tokenId, address seller, address buyer, uint256 quantity, uint256 totalPrice)",
]);

// Free RPC tiers cap eth_getLogs ranges, so the window is walked in chunks.
const CHUNK = BigInt(9000);
// ~2 days of blocks, against a daily schedule. The margin is deliberate:
// Vercel's Hobby plan caps crons at once per day, so a single failed run
// would otherwise leave a permanent hole. Re-scanning is cheap because
// already-recorded sales are filtered out before any verification work.
const LOOKBACK_BLOCKS = BigInt(14400);

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const chainId = Number(new URL(req.url).searchParams.get("chainId") ?? 1);
  const chain = CHAINS[chainId];
  const marketplace = marketplaceAddressFor(chainId);
  if (!chain || !marketplace) {
    return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });
  }

  const rpc = process.env[`RPC_URL_${chainId}`] ?? (chainId === 1 ? process.env.MAINNET_RPC_URL : undefined);
  const client = createPublicClient({ chain, transport: rpc ? http(rpc, { timeout: 20_000 }) : http() });

  await connectDB();
  const latest = await client.getBlockNumber();
  const from = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : BigInt(0);

  const logs = [];
  for (let start = from; start <= latest; start += CHUNK + BigInt(1)) {
    const end = start + CHUNK > latest ? latest : start + CHUNK;
    logs.push(...(await client.getLogs({ address: marketplace, events: SALE_EVENTS, fromBlock: start, toBlock: end })));
  }

  const hashes = [...new Set(logs.map((l) => l.transactionHash))];
  // Only replay what we have no record of — cheap to check, and it keeps a
  // routine run from re-verifying dozens of already-synced transactions.
  const known = new Set(
    (await Activity.find({ txHash: { $in: hashes } }).select("txHash").lean()).map((a) => a.txHash)
  );
  const missing = hashes.filter((h) => !known.has(h));

  const repaired: string[] = [];
  const failed: { txHash: string; reason: string }[] = [];
  for (const txHash of missing) {
    // The buyer is read back from the transaction's own event, so this
    // can't be used to credit a purchase to the wrong wallet.
    const log = logs.find((l) => l.transactionHash === txHash);
    const buyer = (log?.args as { buyer?: string } | undefined)?.buyer;
    if (!buyer) {
      failed.push({ txHash, reason: "no buyer in event" });
      continue;
    }
    const result = await verifyAndSyncPurchase({ txHash, chainId, expectedBuyer: buyer });
    if (result.ok) repaired.push(txHash);
    else failed.push({ txHash, reason: result.error });
  }

  return NextResponse.json({
    chainId,
    scannedBlocks: `${from}-${latest}`,
    salesSeen: hashes.length,
    alreadySynced: hashes.length - missing.length,
    repaired,
    failed,
  });
}
