import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { CollectionOffer } from "@/lib/models/CollectionOffer";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { rootForTokenIds } from "@/lib/web3/offerCriteria";

/**
 * Collection-wide offers: "I'll buy any eligible NFT from this collection
 * at X." Kept entirely separate from Bid (per-item NFT offers) so neither
 * relationship is ambiguous.
 */

// Eligible token ids for a collection, optionally narrowed by trait
// criteria. This set is what gets committed to the merkle root the buyer
// signs, so it must be derived server-side from real data — never taken
// from the client.
async function eligibleTokenIds(
  collectionId: Types.ObjectId,
  criteria: { traitType?: string; values?: string[] } | null
): Promise<string[]> {
  const query: Record<string, unknown> = { collection: collectionId, tokenId: { $ne: null } };
  if (criteria?.traitType && criteria.values?.length) {
    query.traits = {
      $elemMatch: { trait_type: criteria.traitType, value: { $in: criteria.values } },
    };
  }
  const items = await Item.find(query).select("tokenId").lean();
  return items.map((i) => String(i.tokenId)).filter(Boolean);
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid collection" }, { status: 400 });

  await connectDB();
  const now = new Date();
  const offers = await CollectionOffer.find({
    collection: id,
    status: "active",
    $or: [{ deadline: null }, { deadline: { $gt: now } }],
  })
    .sort({ pricePerItemEth: -1 }) // best offer first
    .limit(50)
    .populate("buyer", "username address")
    .lean();

  return NextResponse.json({
    // Fully-filled offers are dropped here rather than in the query, since
    // comparing two fields needs $expr and mongoose mis-casts it on this
    // schema — see the floor route for the same workaround.
    offers: offers
      .filter((o) => o.filledQuantity < o.quantity)
      .map((o) => ({
      id: String(o._id),
      buyer: o.buyer,
      buyerAddress: o.buyerAddress,
      pricePerItemEth: o.pricePerItemEth,
      currency: o.currency,
      quantity: o.quantity,
      filledQuantity: o.filledQuantity,
      remaining: o.quantity - o.filledQuantity,
      criteria: o.criteria,
      deadline: o.deadline,
      nft: o.nft,
      isERC1155: o.isERC1155,
      chainId: o.chainId,
      nonce: o.nonce,
      criteriaRoot: o.criteriaRoot,
      signature: o.signature,
    })),
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to make an offer" }, { status: 401 });
  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid collection" }, { status: 400 });

  await connectDB();
  const collection = await Collection.findById(id).select("contractAddress chainId standard").lean();
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const pricePerItemEth = Number(body.pricePerItemEth);
  const quantity = Math.floor(Number(body.quantity));
  const criteria = body.criteria ?? null;

  if (!Number.isFinite(pricePerItemEth) || pricePerItemEth <= 0) {
    return NextResponse.json({ error: "Enter a valid price per NFT" }, { status: 400 });
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Enter a valid quantity" }, { status: 400 });
  }
  // Escrowed offers are authorised by their on-chain deposit, so they
  // carry an id where the legacy WETH offers carried a signature.
  const escrowOfferId = body.escrowOfferId ? String(body.escrowOfferId) : null;
  if (!escrowOfferId && (typeof body.signature !== "string" || !body.nonce || !body.criteriaRoot)) {
    return NextResponse.json({ error: "A signed offer is required" }, { status: 400 });
  }

  // Recompute the eligible set and its root independently, then require the
  // signed root to match. Otherwise a buyer could sign a root covering
  // items they don't actually want to be bound to — or worse, one covering
  // a different collection entirely.
  const tokenIds = await eligibleTokenIds(new Types.ObjectId(id), criteria);
  if (tokenIds.length === 0) {
    return NextResponse.json(
      { error: "No minted NFTs in this collection match that criteria yet, so an offer can't be secured" },
      { status: 400 }
    );
  }
  const expectedRoot = rootForTokenIds(tokenIds);
  if (String(body.criteriaRoot).toLowerCase() !== expectedRoot.toLowerCase()) {
    return NextResponse.json(
      { error: "Offer eligibility doesn't match this collection — refresh and try again" },
      { status: 409 }
    );
  }

  const offer = await CollectionOffer.create({
    collection: collection._id,
    buyer: user._id,
    buyerAddress: user.address,
    pricePerItemEth,
    quantity,
    filledQuantity: 0,
    criteria,
    criteriaRoot: expectedRoot,
    eligibleTokenIds: tokenIds,
    nft: collection.contractAddress,
    isERC1155: collection.standard === "ERC1155",
    chainId: collection.chainId,
    nonce: String(body.nonce),
    deadline: body.deadline ? new Date(Number(body.deadline) * 1000) : null,
    signature: escrowOfferId ? null : body.signature,
    escrowOfferId,
    status: "active",
  });

  return NextResponse.json({ id: String(offer._id) }, { status: 201 });
}
