/**
 * On-demand alternative to running scripts/indexer.ts continuously: the
 * buyer's own browser tells the server "I just confirmed transaction X" and
 * the server independently re-fetches that transaction from the chain,
 * confirms it actually succeeded and actually matches this buyer, then
 * applies the exact same MongoDB update the indexer would have. The client
 * is never trusted to report "I bought it" — only a real on-chain receipt is.
 */
import { createPublicClient, http, getAddress, parseAbi, parseEventLogs } from "viem";
import {
  mainnet,
  sepolia,
  polygon,
  polygonAmoy,
  base,
  arbitrum,
  optimism,
  avalanche,
  bsc,
  hyperliquid,
  hardhat,
  type Chain,
} from "viem/chains";
import { handleVoucherRedeemed, handleResale } from "@/lib/web3/chainSync";

const CHAINS: Record<number, Chain> = Object.fromEntries(
  [mainnet, sepolia, polygon, polygonAmoy, base, arbitrum, optimism, avalanche, bsc, hyperliquid, hardhat].map(
    (chain) => [chain.id, chain]
  )
);

const MARKETPLACE_EVENTS_ABI = parseAbi([
  "event VoucherRedeemed(address indexed nft, uint256 indexed tokenId, address buyer, uint256 price)",
  "event ListingFilled(address indexed nft, uint256 indexed tokenId, address seller, address buyer, uint256 price)",
  "event AuctionSettled(address indexed nft, uint256 indexed tokenId, address seller, address winner, uint256 amount)",
]);

export async function verifyAndSyncPurchase({
  txHash,
  chainId,
  expectedBuyer,
}: {
  txHash: `0x${string}`;
  chainId: number;
  expectedBuyer: string;
}) {
  const chain = CHAINS[chainId];
  if (!chain) return { ok: false as const, error: "Unsupported chain" };

  const marketplaceAddress = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS;
  if (!marketplaceAddress) return { ok: false as const, error: "Marketplace contract not configured" };

  const client = createPublicClient({
    chain,
    transport: chainId === hardhat.id ? http("http://127.0.0.1:8545") : http(),
  });

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch {
    return { ok: false as const, error: "Transaction not found on-chain yet — try again shortly" };
  }
  if (receipt.status !== "success") return { ok: false as const, error: "Transaction did not succeed" };
  if (!receipt.to || getAddress(receipt.to) !== getAddress(marketplaceAddress)) {
    return { ok: false as const, error: "Transaction wasn't sent to the marketplace contract" };
  }

  const logs = parseEventLogs({ abi: MARKETPLACE_EVENTS_ABI, logs: receipt.logs });
  for (const log of logs) {
    if (log.eventName === "VoucherRedeemed") {
      const { nft, tokenId, buyer, price } = log.args;
      if (buyer.toLowerCase() !== expectedBuyer.toLowerCase()) {
        return { ok: false as const, error: "This transaction wasn't made by you" };
      }
      const result = await handleVoucherRedeemed(nft, tokenId, buyer, price, txHash);
      return { ok: true as const, ...result };
    }
    if (log.eventName === "ListingFilled" || log.eventName === "AuctionSettled") {
      const { nft, tokenId, seller } = log.args;
      const buyer = "buyer" in log.args ? log.args.buyer : log.args.winner;
      const price = "price" in log.args ? log.args.price : log.args.amount;
      if (buyer.toLowerCase() !== expectedBuyer.toLowerCase()) {
        return { ok: false as const, error: "This transaction wasn't made by you" };
      }
      const result = await handleResale(nft, tokenId, seller, buyer, price, txHash);
      return { ok: true as const, ...result };
    }
  }

  return { ok: false as const, error: "No matching marketplace event found in this transaction" };
}
