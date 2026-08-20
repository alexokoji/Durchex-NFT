/**
 * Server-side verification of a DurchexOffers fill, mirroring how
 * verifyPurchase handles marketplace sales: the seller's browser reports a
 * transaction hash, and the server independently re-reads that transaction
 * from chain before believing anything about it. The client is never
 * trusted to assert that an offer was filled.
 */
import { createPublicClient, http, getAddress, parseAbi, parseEventLogs, formatEther } from "viem";
import { mainnet, sepolia, hardhat, type Chain } from "viem/chains";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { ItemBalance } from "@/lib/models/ItemBalance";
import { Activity } from "@/lib/models/Activity";
import { Bid } from "@/lib/models/Bid";
import { CollectionOffer } from "@/lib/models/CollectionOffer";
import { recordActivity } from "@/lib/activity";
import { recalculateCollectionFloor } from "@/lib/floorPrice";
import { resolveOrCreateUser } from "@/lib/web3/chainSync";
import { offersAddressFor } from "@/lib/web3/offerCriteria";
import { offersEscrowAddressFor } from "@/lib/web3/offersEscrow";

const CHAINS: Record<number, Chain> = Object.fromEntries(
  [mainnet, sepolia, hardhat].map((c) => [c.id, c])
);

const OFFERS_EVENTS_ABI = parseAbi([
  "event CollectionOfferFilled(address indexed nft, uint256 indexed tokenId, address indexed buyer, address seller, uint256 quantity, uint256 totalPrice, uint256 nonce)",
  // The escrow contract's equivalent. Offers moved to escrowed ETH and
  // this event was never taught to the confirm path, so a completed
  // trade — NFT delivered, seller paid, escrow emptied — left the offer
  // still showing "accept" and the buyer's holding unrecorded.
  "event OfferFilled(uint256 indexed offerId, uint256 indexed tokenId, address indexed seller, address buyer, uint256 quantity, uint256 totalPrice)",
]);

export async function verifyAndSyncOfferFill({
  txHash,
  chainId,
  expectedSeller,
}: {
  txHash: `0x${string}`;
  chainId: number;
  expectedSeller: string;
}) {
  const chain = CHAINS[chainId];
  if (!chain) return { ok: false as const, error: "Unsupported chain" };

  // Either settlement contract is legitimate: the escrow one for new
  // offers, the old one for anything signed before the move.
  const offersAddress = offersAddressFor(chainId);
  const escrowAddress = offersEscrowAddressFor(chainId);
  if (!offersAddress && !escrowAddress) {
    return { ok: false as const, error: "Offers contract not configured for this chain" };
  }

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
  const sentTo = receipt.to ? getAddress(receipt.to) : null;
  const settlementAddresses = [offersAddress, escrowAddress]
    .filter(Boolean)
    .map((a) => getAddress(a as string));
  if (!sentTo || !settlementAddresses.includes(sentTo)) {
    return { ok: false as const, error: "Transaction wasn't sent to an offers contract" };
  }

  const logs = parseEventLogs({ abi: OFFERS_EVENTS_ABI, logs: receipt.logs });
  const log = logs.find(
    (l) => l.eventName === "CollectionOfferFilled" || l.eventName === "OfferFilled"
  );
  if (!log) return { ok: false as const, error: "No offer fill found in this transaction" };

  // The two events carry the same facts in a different shape; the escrow
  // one has an offer id where the signature-based one had a nonce.
  const args = log.args as {
    tokenId: bigint;
    buyer: string;
    seller: string;
    quantity: bigint;
    totalPrice: bigint;
    nonce?: bigint;
    offerId?: bigint;
  };
  const { tokenId, buyer, seller, quantity, totalPrice } = args;
  const nonce = args.nonce ?? args.offerId ?? BigInt(0);
  if (seller.toLowerCase() !== expectedSeller.toLowerCase()) {
    return { ok: false as const, error: "This transaction wasn't made by you" };
  }

  const item = await Item.findOne({ tokenId: tokenId.toString() });
  if (!item) return { ok: false as const, error: "No matching item" };
  // txHash-keyed idempotency: one offer signature can legitimately be
  // filled many times, so item state alone can't tell us if this specific
  // fill was already applied.
  if (await Activity.exists({ item: item._id, txHash })) {
    return { ok: true as const, synced: false as const, reason: "already synced" };
  }

  const collection = await Collection.findById(item.collection);
  if (!collection) return { ok: false as const, error: "Item has no collection" };

  const buyerUser = await resolveOrCreateUser(buyer);
  const sellerUser = await resolveOrCreateUser(seller);
  const qty = Number(quantity);
  const priceEth = Number(formatEther(totalPrice));

  // Which kind of offer was this? A Bid carrying this nonce means it was a
  // per-item NFT offer; otherwise it's a collection-wide one.
  const bid = await Bid.findOne({ nonce: nonce.toString(), buyerAddress: buyer.toLowerCase(), type: "offer" });
  const collectionOffer = bid
    ? null
    : await CollectionOffer.findOne({ nonce: nonce.toString(), buyerAddress: buyer.toLowerCase() });
  const saleType = bid ? "NFT_OFFER" : "COLLECTION_OFFER";

  if (item.standard === "ERC1155") {
    await Promise.all([
      ItemBalance.findOneAndUpdate({ item: item._id, owner: sellerUser._id }, { $inc: { quantity: -qty } }),
      ItemBalance.findOneAndUpdate(
        { item: item._id, owner: buyerUser._id },
        { $inc: { quantity: qty } },
        { upsert: true }
      ),
    ]);
  } else {
    item.owner = buyerUser._id;
    // Selling into an offer ends any listing the item had — priceEth is
    // the current ask, and there no longer is one.
    item.status = "not_listed";
    item.priceEth = 0;
    item.listing = undefined;
  }
  item.lastSalePriceEth = priceEth;
  item.lastSaleTxHash = txHash;
  await item.save();

  if (bid) {
    bid.status = "accepted";
    await bid.save();
  } else if (collectionOffer) {
    // Mirror the contract's counter. The contract stays authoritative;
    // this is what the UI reads.
    collectionOffer.filledQuantity = Math.min(
      collectionOffer.quantity,
      collectionOffer.filledQuantity + qty
    );
    if (collectionOffer.filledQuantity >= collectionOffer.quantity) {
      collectionOffer.status = "filled";
    }
    await collectionOffer.save();
  }

  await Promise.all([
    Collection.updateOne(
      { _id: collection._id },
      { $inc: { "stats.sales": 1, "stats.volume24hEth": priceEth, "stats.totalVolumeEth": priceEth } }
    ),
    recordActivity({
      type: "sale",
      item: item._id,
      from: sellerUser._id,
      to: buyerUser._id,
      priceEth,
      quantity: item.standard === "ERC1155" ? qty : null,
      saleType,
      txHash,
    }),
    recalculateCollectionFloor(collection._id),
  ]);

  return { ok: true as const, synced: true as const, itemId: String(item._id), saleType };
}
