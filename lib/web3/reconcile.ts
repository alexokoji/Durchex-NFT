import { createPublicClient, http, parseAbi, type Chain } from "viem";
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

// Free RPC tiers cap eth_getLogs ranges, so any window is walked in chunks.
const CHUNK = BigInt(9000);

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

export function rpcClient(chainId: number) {
  const chain = CHAINS[chainId];
  if (!chain) return null;
  const rpc =
    process.env[`RPC_URL_${chainId}`] ??
    (chainId === 1 ? process.env.MAINNET_RPC_URL : undefined);
  return createPublicClient({ chain, transport: rpc ? http(rpc, { timeout: 20_000 }) : http() });
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
 */
export async function reconcileRange({
  chainId,
  fromBlock,
  maxBlocks = BigInt(50_000),
  timeBudgetMs = 45_000,
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
  const ceiling = fromBlock + maxBlocks > head ? head : fromBlock + maxBlocks;

  const logs = [];
  let scannedTo = fromBlock;
  for (let start = fromBlock; start <= ceiling; start += CHUNK + BigInt(1)) {
    const end = start + CHUNK > ceiling ? ceiling : start + CHUNK;
    logs.push(
      ...(await client.getLogs({ address: marketplace, events: SALE_EVENTS, fromBlock: start, toBlock: end }))
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
    fromBlock: String(fromBlock),
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
