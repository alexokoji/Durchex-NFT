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
import { createPublicClient, http, formatEther, parseAbi, type Address } from "viem";
import { connectDB } from "../lib/db";
import { Collection } from "../lib/models/Collection";
import { Item } from "../lib/models/Item";
import { User } from "../lib/models/User";
import { recordActivity } from "../lib/activity";

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

async function resolveOrCreateUser(address: string) {
  const lower = address.toLowerCase();
  let user = await User.findOne({ address: lower });
  if (!user) {
    user = await User.create({ address: lower, username: `wallet_${lower.slice(2, 8)}` });
  }
  return user;
}

async function findCollectionByContract(nftAddress: string) {
  return Collection.findOne({ contractAddress: nftAddress.toLowerCase() });
}

/** A lazy item's first sale: mints it (isMinted/tokenId weren't set until now) and transfers to the buyer. */
async function handleVoucherRedeemed(
  nft: string,
  tokenId: bigint,
  buyer: string,
  price: bigint,
  txHash: string
) {
  const collection = await findCollectionByContract(nft);
  if (!collection) {
    console.warn(`[indexer] VoucherRedeemed for unknown collection contract ${nft}`);
    return;
  }

  const item = await Item.findOne({
    collection: collection._id,
    "voucher.tokenId": tokenId.toString(),
    isMinted: false,
  });
  if (!item) {
    console.warn(`[indexer] VoucherRedeemed: no matching lazy item for tokenId ${tokenId} in ${nft}`);
    return;
  }

  const buyerUser = await resolveOrCreateUser(buyer);
  const priceEth = Number(formatEther(price));

  item.isMinted = true;
  item.tokenId = tokenId.toString();
  item.owner = buyerUser._id;
  item.status = "not_listed";
  item.priceEth = priceEth;
  await item.save();

  await Promise.all([
    Collection.updateOne(
      { _id: collection._id },
      { $inc: { "stats.sales": 1, "stats.volume24hEth": priceEth, "stats.totalVolumeEth": priceEth } }
    ),
    recordActivity({
      type: "sale",
      item: item._id,
      from: item.creator,
      to: buyerUser._id,
      priceEth,
      txHash,
    }),
  ]);

  console.log(`[indexer] Minted + sold "${item.name}" (token ${tokenId}) to ${buyer} for ${priceEth} ETH`);
}

/** A resale of an already-minted item, either fixed-price or a settled auction. */
async function handleResale(
  nft: string,
  tokenId: bigint,
  seller: string,
  buyer: string,
  price: bigint,
  txHash: string
) {
  const collection = await findCollectionByContract(nft);
  if (!collection) {
    console.warn(`[indexer] Resale for unknown collection contract ${nft}`);
    return;
  }

  const item = await Item.findOne({ collection: collection._id, tokenId: tokenId.toString() });
  if (!item) {
    console.warn(`[indexer] Resale: no matching item for tokenId ${tokenId} in ${nft}`);
    return;
  }

  const buyerUser = await resolveOrCreateUser(buyer);
  const priceEth = Number(formatEther(price));

  item.owner = buyerUser._id;
  item.status = "not_listed";
  item.priceEth = priceEth;
  item.highestBidEth = 0;
  item.auctionEndsAt = null;
  await item.save();

  await Promise.all([
    Collection.updateOne(
      { _id: collection._id },
      { $inc: { "stats.sales": 1, "stats.volume24hEth": priceEth, "stats.totalVolumeEth": priceEth } }
    ),
    recordActivity({
      type: "sale",
      item: item._id,
      from: (await User.findOne({ address: seller.toLowerCase() }))?._id,
      to: buyerUser._id,
      priceEth,
      txHash,
    }),
  ]);

  console.log(`[indexer] Resold "${item.name}" (token ${tokenId}) to ${buyer} for ${priceEth} ETH`);
}

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
          handleVoucherRedeemed(nft, tokenId, buyer, price, log.transactionHash).catch((err) =>
            console.error("[indexer] Error handling VoucherRedeemed:", err)
          );
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
          handleResale(nft, tokenId, seller, buyer, price, log.transactionHash).catch((err) =>
            console.error("[indexer] Error handling ListingFilled:", err)
          );
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
          handleResale(nft, tokenId, seller, winner, amount, log.transactionHash).catch((err) =>
            console.error("[indexer] Error handling AuctionSettled:", err)
          );
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
