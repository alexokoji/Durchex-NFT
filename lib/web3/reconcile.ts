import { createPublicClient, fallback, http, parseAbi, type Chain } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { Activity } from "@/lib/models/Activity";
import { SyncState, reconcileKey } from "@/lib/models/SyncState";
import { verifyAndSyncPurchase } from "@/lib/web3/verifyPurchase";
import { marketplaceAddressFor } from "@/lib/web3/marketplaceAbi";

/**
 * Replays sales the app never recorded, from the chain.
 *
 * Ownership is normally synced by the buyer's own browser calling
 * /api/purchases/confirm right after their transaction mines. That works
 * until it doesn't: a closed tab, a failed request, or a wallet that
 * navigates away mid-flow all leave a real, paid-for purchase invisible on
 * the platform while being perfectly valid on-chain — which is exactly why
 * holders were opening their profile to find nothing there.
 *
 * So the chain is the source of truth, and this runs over it. Everything
 * here is idempotent: an already-recorded sale is filtered out before any
 * verification work, and the sync handlers themselves no-op on a repeat.
 * That means it is always safe to re-run, over any range, as many times as
 * you like — which is what makes a full historical backfill possible with
 * the same code path as the nightly job.
 */
export const CHAINS: Record<number, Chain> = { 1: mainnet, 11155111: sepolia };

const SALE_EVENTS = parseAbi([
  "event VoucherRedeemed(address indexed nft, uint256 indexed tokenId, address buyer, uint256 price)",
  "event ListingFilled(address indexed nft, uint256 indexed tokenId, address seller, address buyer, uint256 price)",
  "event EditionRedeemed(address indexed nft, uint256 indexed tokenId, address buyer, uint256 quantity, uint256 totalPrice)",
  "event Listing1155Filled(address indexed nft, uint256 indexed tokenId, address seller, address buyer, uint256 quantity, uint256 totalPrice)",
]);

// Free RPC tiers cap eth_getLogs by response time, not just range, and
// 9000 blocks was reliably over the line — every backfill call died with
// "Request timeout on the free plan". 1000 is served comfortably.
const CHUNK = BigInt(1000);

// Nothing this marketplace cares about happened before its own contract
// existed, and asking a free RPC for logs from block 0 is both pointless
// and guaranteed to time out. Scans are clamped to start here.
const DEPLOY_BLOCK: Record<number, bigint> = {
  1: BigInt(25_780_000), // Ethereum, shortly before the 2026-08-18 deploy
  11155111: BigInt(0), // Sepolia: no floor worth pinning for a testnet
};

export function earliestBlock(chainId: number): bigint {
  return DEPLOY_BLOCK[chainId] ?? BigInt(0);
}

export type ReconcileResult = {
  chainId: number;
  fromBlock: string;
  toBlock: string;
  /** Where a follow-up call should resume; null once caught up to head. */
  nextBlock: string | null;
  salesSeen: number;
  alreadySynced: number;
  repaired: string[];
  failed: { txHash: string; reason: string }[];
};

/**
 * The client these scans run on.
 *
 * Reconciliation is bursty by nature — a pass walks thousands of blocks in
 * chunks and then reads receipts — and the free drpc tier refuses partway
 * through, which is why whole steps kept failing on rate limits while
 * doing nothing wrong. Alchemy is tried first where a key exists, with
 * drpc behind it: viem's fallback moves on when a transport errors, so
 * either being down or throttled costs a retry rather than the pass.
 *
 * drpc stays the browser-side transport; this is only the server's
 * scanning path.
 */
export function rpcClient(chainId: number) {
  const chain = CHAINS[chainId];
  if (!chain) return null;

  const alchemyHost: Record<number, string> = {
    1: "https://eth-mainnet.g.alchemy.com/v2/",
    11155111: "https://eth-sepolia.g.alchemy.com/v2/",
  };
  const key = process.env.ALCHEMY_API_KEY;
  const configured =
    process.env[`RPC_URL_${chainId}`] ??
    (chainId === 1 ? process.env.MAINNET_RPC_URL : undefined);

  const transports = [
    key && alchemyHost[chainId] ? http(`${alchemyHost[chainId]}${key}`, { timeout: 20_000 }) : null,
    configured ? http(configured, { timeout: 20_000 }) : null,
  ].filter((t): t is NonNullable<typeof t> => t !== null);

  return createPublicClient({
    chain,
    transport: transports.length > 0 ? fallback(transports) : http(),
  });
}

/**
 * Scans forward from `fromBlock`, stopping at head or when the block or
 * time budget runs out — whichever comes first.
 *
 * The budgets exist because a full backfill from a contract's deployment
 * can be millions of blocks, far past any serverless timeout. Returning
 * `nextBlock` instead of trying to finish lets the caller resume, so the
 * same function serves both the nightly catch-up and a long backfill
 * driven one call at a time.
 *
 * They are deliberately well under the platform's function limit: a run
 * that overruns is killed mid-flight and answers with an error page, not
 * JSON, which the caller can only report as a parse failure. Stopping
 * early and reporting where we got to is always recoverable; being killed
 * is not.
 */
export async function reconcileRange({
  chainId,
  fromBlock,
  maxBlocks = BigInt(20_000),
  timeBudgetMs = 8_000,
}: {
  chainId: number;
  fromBlock: bigint;
  maxBlocks?: bigint;
  timeBudgetMs?: number;
}): Promise<ReconcileResult | { error: string }> {
  const client = rpcClient(chainId);
  const marketplace = marketplaceAddressFor(chainId);
  if (!client || !marketplace) return { error: "Unsupported chain" };

  const startedAt = Date.now();
  const head = await client.getBlockNumber();
  const floor = earliestBlock(chainId);
  const start = fromBlock < floor ? floor : fromBlock;
  const ceiling = start + maxBlocks > head ? head : start + maxBlocks;

  const logs = [];
  let scannedTo = start;
  for (let cursor = start; cursor <= ceiling; cursor += CHUNK + BigInt(1)) {
    const end = cursor + CHUNK > ceiling ? ceiling : cursor + CHUNK;
    logs.push(
      ...(await client.getLogs({ address: marketplace, events: SALE_EVENTS, fromBlock: cursor, toBlock: end }))
    );
    scannedTo = end;
    if (Date.now() - startedAt > timeBudgetMs) break;
  }

  const hashes = [...new Set(logs.map((l) => l.transactionHash))];
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

  return {
    chainId,
    fromBlock: String(start),
    toBlock: String(scannedTo),
    nextBlock: scannedTo < head ? String(scannedTo + BigInt(1)) : null,
    salesSeen: hashes.length,
    alreadySynced: hashes.length - missing.length,
    repaired,
    failed,
  };
}

/** The block the reconciler should resume from, or null if never run. */
export async function getWatermark(chainId: number): Promise<bigint | null> {
  const state = await SyncState.findOne({ key: reconcileKey(chainId) }).lean();
  return state ? BigInt(state.blockNumber) : null;
}

export async function setWatermark(chainId: number, blockNumber: bigint) {
  await SyncState.findOneAndUpdate(
    { key: reconcileKey(chainId) },
    { blockNumber: String(blockNumber) },
    { upsert: true }
  );
}
