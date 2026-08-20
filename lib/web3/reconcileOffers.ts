import { parseAbiItem, formatEther } from "viem";
import { Types } from "mongoose";
import { Bid } from "@/lib/models/Bid";
import { Item } from "@/lib/models/Item";
import { Collection } from "@/lib/models/Collection";
import { User } from "@/lib/models/User";
import { leafOf } from "@/lib/web3/offerCriteria";
import { offersEscrowAddressFor } from "@/lib/web3/offersEscrow";
import { rpcClient } from "@/lib/web3/reconcile";

/**
 * Recovers escrowed offers the site never recorded.
 *
 * Making an offer is now two steps that can fail independently: the buyer's
 * ETH goes into the escrow contract, and then we write a row. If the write
 * fails — a bad response, a closed tab, a server error — the buyer has been
 * debited for an offer nobody can see or accept. That is the worst failure
 * this system can have, so it cannot be left to the browser to get right.
 *
 * The chain is the record. Every OfferMade event is checked against our
 * rows and anything missing is written from the event itself, which also
 * means the amount and buyer can't be forged by whoever triggers this.
 *
 * Re-running is safe: offers already recorded are skipped by their id.
 */
const OFFER_MADE = parseAbiItem(
  "event OfferMade(uint256 indexed offerId, address indexed buyer, address indexed nft, bytes32 criteriaRoot, uint256 pricePerItem, uint256 quantity, uint256 deadline)"
);

const ESCROW_ABI = [
  {
    type: "function",
    name: "escrowOf",
    stateMutability: "view",
    inputs: [{ name: "offerId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// Free RPC tiers cap log ranges by response time, so this walks in the
// same small chunks the sales reconciler settled on.
const CHUNK = BigInt(900);

export type OfferReconcileResult = {
  scanned: string;
  seen: number;
  alreadyRecorded: number;
  recovered: { offerId: string; itemId: string; priceEth: number }[];
  skipped: { offerId: string; reason: string }[];
};

export async function reconcileOffers({
  chainId,
  lookbackBlocks = BigInt(50_000),
}: {
  chainId: number;
  lookbackBlocks?: bigint;
}): Promise<OfferReconcileResult | { error: string }> {
  const client = rpcClient(chainId);
  const escrow = offersEscrowAddressFor(chainId);
  if (!client || !escrow) return { error: "Escrow contract isn't configured for this chain" };

  const head = await client.getBlockNumber();
  const from = head > lookbackBlocks ? head - lookbackBlocks : BigInt(0);

  const logs = [];
  for (let cursor = from; cursor <= head; cursor += CHUNK + BigInt(1)) {
    const to = cursor + CHUNK > head ? head : cursor + CHUNK;
    logs.push(...(await client.getLogs({ address: escrow, event: OFFER_MADE, fromBlock: cursor, toBlock: to })));
  }

  const recovered: OfferReconcileResult["recovered"] = [];
  const skipped: OfferReconcileResult["skipped"] = [];
  let alreadyRecorded = 0;

  for (const log of logs) {
    const args = log.args as {
      offerId?: bigint;
      buyer?: string;
      nft?: string;
      criteriaRoot?: string;
      pricePerItem?: bigint;
      quantity?: bigint;
      deadline?: bigint;
    };
    if (args.offerId === undefined || !args.buyer || !args.nft) continue;
    const offerId = String(args.offerId);

    if (await Bid.exists({ escrowOfferId: offerId })) {
      alreadyRecorded += 1;
      continue;
    }

    // An offer with nothing left escrowed was already filled or withdrawn;
    // writing it now would show a live offer that cannot be accepted.
    const remaining = (await client.readContract({
      address: escrow,
      abi: ESCROW_ABI,
      functionName: "escrowOf",
      args: [args.offerId],
    })) as bigint;
    if (remaining === BigInt(0)) {
      skipped.push({ offerId, reason: "no escrow remaining — already filled or withdrawn" });
      continue;
    }

    // Which token the offer names is derived from the root the buyer
    // committed to, never from anything supplied here.
    const collections = await Collection.find({
      contractAddress: { $regex: `^${args.nft}$`, $options: "i" },
    })
      .select("_id")
      .lean();
    if (collections.length === 0) {
      skipped.push({ offerId, reason: `no collection for contract ${args.nft}` });
      continue;
    }

    const candidates = await Item.find({
      collection: { $in: collections.map((c) => c._id) },
      tokenId: { $ne: null },
    })
      .select("_id tokenId owner")
      .lean();
    const match = candidates.find(
      (i) => leafOf(String(i.tokenId)).toLowerCase() === String(args.criteriaRoot).toLowerCase()
    );
    if (!match) {
      skipped.push({ offerId, reason: "criteria root matches no single item (collection-wide offer)" });
      continue;
    }

    const buyerUser = await User.findOneAndUpdate(
      { address: args.buyer.toLowerCase() },
      { $setOnInsert: { address: args.buyer.toLowerCase(), username: `user_${args.buyer.slice(2, 8)}` } },
      { new: true, upsert: true }
    );

    const priceEth = Number(formatEther(args.pricePerItem ?? BigInt(0)));
    await Bid.create({
      item: match._id as Types.ObjectId,
      bidder: buyerUser._id,
      type: "offer",
      amountEth: priceEth,
      quantity: Number(args.quantity ?? BigInt(1)),
      status: "active",
      escrowOfferId: offerId,
      buyerAddress: args.buyer.toLowerCase(),
      nft: args.nft,
      criteriaRoot: args.criteriaRoot,
      chainId,
      deadline: args.deadline ? new Date(Number(args.deadline) * 1000) : null,
      expiresAt: args.deadline ? new Date(Number(args.deadline) * 1000) : null,
    });

    recovered.push({ offerId, itemId: String(match._id), priceEth });
  }

  return {
    scanned: `${from}-${head}`,
    seen: logs.length,
    alreadyRecorded,
    recovered,
    skipped,
  };
}
