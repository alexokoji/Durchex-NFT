import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { CollectionOffer } from "@/lib/models/CollectionOffer";
import { Item } from "@/lib/models/Item";
import { ItemBalance } from "@/lib/models/ItemBalance";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { proofForTokenId } from "@/lib/web3/offerCriteria";

/** Cancel an offer (buyer only). The buyer should also call cancelOffer
 *  on-chain; until they do, the signature technically remains fillable, so
 *  this alone is not treated as authoritative. */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid offer" }, { status: 400 });

  await connectDB();
  const offer = await CollectionOffer.findById(id);
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  if (String(offer.buyer) !== String(user._id)) {
    return NextResponse.json({ error: "Only the buyer can cancel this offer" }, { status: 403 });
  }

  offer.status = "cancelled";
  await offer.save();
  return NextResponse.json({ id: String(offer._id), status: offer.status });
}

/**
 * Prepares a seller's acceptance: validates every eligibility rule the
 * contract will also enforce, then returns the merkle proof the seller
 * needs to call acceptCollectionOffer.
 *
 * Nothing here moves funds — settlement is entirely on-chain. The checks
 * exist to fail early with a readable reason instead of burning gas on a
 * revert, and the contract independently re-verifies all of them.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid offer" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const itemId = String(body.itemId ?? "");
  if (!Types.ObjectId.isValid(itemId)) return NextResponse.json({ error: "Invalid item" }, { status: 400 });

  await connectDB();
  const offer = await CollectionOffer.findById(id);
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  if (offer.status !== "active") {
    return NextResponse.json({ error: "This offer is no longer active" }, { status: 409 });
  }
  if (offer.deadline && offer.deadline.getTime() <= Date.now()) {
    return NextResponse.json({ error: "This offer has expired" }, { status: 409 });
  }
  if (offer.filledQuantity >= offer.quantity) {
    return NextResponse.json({ error: "This offer has already been fully filled" }, { status: 409 });
  }

  const item = await Item.findById(itemId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (String(item.collection) !== String(offer.collection)) {
    return NextResponse.json({ error: "That NFT isn't part of this collection" }, { status: 400 });
  }
  if (!item.isMinted || !item.tokenId) {
    return NextResponse.json(
      { error: "Only minted NFTs can fill a collection offer — this one hasn't been minted yet" },
      { status: 400 }
    );
  }
  if (String(offer.buyerAddress).toLowerCase() === user.address.toLowerCase()) {
    return NextResponse.json({ error: "You can't fill your own offer" }, { status: 400 });
  }

  // Ownership: 721 has a single owner; 1155 ownership is a per-wallet balance.
  if (item.standard === "ERC1155") {
    const balance = await ItemBalance.findOne({ item: item._id, owner: user._id });
    if (!balance || balance.quantity < 1) {
      return NextResponse.json({ error: "You don't hold any units of this NFT" }, { status: 403 });
    }
  } else if (String(item.owner) !== String(user._id)) {
    return NextResponse.json({ error: "Only the current owner can accept this offer" }, { status: 403 });
  }

  if (!offer.eligibleTokenIds.includes(String(item.tokenId))) {
    return NextResponse.json(
      { error: "This NFT doesn't match the offer's criteria" },
      { status: 400 }
    );
  }

  const proof = offer.criteria || offer.eligibleTokenIds.length > 0
    ? proofForTokenId(offer.eligibleTokenIds, String(item.tokenId))
    : [];

  return NextResponse.json({
    proof,
    tokenId: String(item.tokenId),
    offer: {
      nft: offer.nft,
      isERC1155: offer.isERC1155,
      criteriaRoot: offer.criteriaRoot,
      pricePerItem: String(Math.round(offer.pricePerItemEth * 1e18)),
      quantity: String(offer.quantity),
      deadline: String(offer.deadline ? Math.floor(offer.deadline.getTime() / 1000) : 0),
      nonce: offer.nonce,
      buyer: offer.buyerAddress,
    },
    signature: offer.signature,
    chainId: offer.chainId,
  });
}
