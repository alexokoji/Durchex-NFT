/**
 * Chain-event indexer worker (spec section 3, "Chain-Event Indexer").
 *
 * Watches DurchexNFT + DurchexMarketplace on-chain events and syncs MongoDB:
 * a VoucherRedeemed means a lazy item just minted and sold, ListingFilled /
 * AuctionSettled mean an already-minted item changed hands. API routes never
 * trust "sold" state directly from a client — only this worker, reacting to
 * confirmed on-chain events, is allowed to flip an Item's owner/status, so a
 * transaction that reverts can never desync the UI from on-chain truth.
 *
 * Run: tsx scripts/indexer.ts
 * Env: INDEXER_RPC_URL (default local Hardhat node), DURCHEX_NFT_ADDRESS,
 *      DURCHEX_MARKETPLACE_ADDRESS (both required).
 */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { connectDB } from "../lib/db";
import { handleVoucherRedeemed, handleResale } from "../lib/web3/chainSync";

const RPC_URL = process.env.INDEXER_RPC_URL || "http://127.0.0.1:8545";
const NFT_ADDRESS = process.env.DURCHEX_NFT_ADDRESS as Address | undefined;
const MARKETPLACE_ADDRESS = process.env.DURCHEX_MARKETPLACE_ADDRESS as Address | undefined;

if (!NFT_ADDRESS || !MARKETPLACE_ADDRESS) {
  console.error("Set DURCHEX_NFT_ADDRESS and DURCHEX_MARKETPLACE_ADDRESS to run the indexer.");
  process.exit(1);
}

const MARKETPLACE_ABI = parseAbi([
  "event VoucherRedeemed(address indexed nft, uint256 indexed tokenId, address buyer, uint256 price)",
  "event ListingFilled(address indexed nft, uint256 indexed tokenId, address seller, address buyer, uint256 price)",
  "event AuctionSettled(address indexed nft, uint256 indexed tokenId, address seller, address winner, uint256 amount)",
]);

async function main() {
  await connectDB();
  console.log(`[indexer] Connected to MongoDB. Watching ${RPC_URL}`);
  console.log(`[indexer] DurchexNFT: ${NFT_ADDRESS}`);
  console.log(`[indexer] DurchexMarketplace: ${MARKETPLACE_ADDRESS}`);

  const client = createPublicClient({ transport: http(RPC_URL) });

  client.watchContractEvent({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    eventName: "VoucherRedeemed",
    onLogs: (logs) => {
      for (const log of logs) {
        const { nft, tokenId, buyer, price } = log.args;
        if (nft && tokenId !== undefined && buyer && price !== undefined) {
          handleVoucherRedeemed(nft, tokenId, buyer, price, log.transactionHash)
            .then((result) =>
              result.synced
                ? console.log(`[indexer] Minted + sold token ${tokenId} to ${buyer}`)
                : console.warn(`[indexer] VoucherRedeemed skipped: ${result.reason}`)
            )
            .catch((err) => console.error("[indexer] Error handling VoucherRedeemed:", err));
        }
      }
    },
  });

  client.watchContractEvent({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    eventName: "ListingFilled",
    onLogs: (logs) => {
      for (const log of logs) {
        const { nft, tokenId, seller, buyer, price } = log.args;
        if (nft && tokenId !== undefined && seller && buyer && price !== undefined) {
          handleResale(nft, tokenId, seller, buyer, price, log.transactionHash)
            .then((result) =>
              result.synced
                ? console.log(`[indexer] Resold token ${tokenId} to ${buyer}`)
                : console.warn(`[indexer] ListingFilled skipped: ${result.reason}`)
            )
            .catch((err) => console.error("[indexer] Error handling ListingFilled:", err));
        }
      }
    },
  });

  client.watchContractEvent({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    eventName: "AuctionSettled",
    onLogs: (logs) => {
      for (const log of logs) {
        const { nft, tokenId, seller, winner, amount } = log.args;
        if (nft && tokenId !== undefined && seller && winner && amount !== undefined) {
          handleResale(nft, tokenId, seller, winner, amount, log.transactionHash)
            .then((result) =>
              result.synced
                ? console.log(`[indexer] Auction settled: token ${tokenId} to ${winner}`)
                : console.warn(`[indexer] AuctionSettled skipped: ${result.reason}`)
            )
            .catch((err) => console.error("[indexer] Error handling AuctionSettled:", err));
        }
      }
    },
  });

  console.log("[indexer] Listening for events. Ctrl+C to stop.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
