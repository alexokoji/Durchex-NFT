import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Item } from "@/lib/models/Item";
import { Collection } from "@/lib/models/Collection";
import { isItemMintedOut, itemMintRemaining, listingGate } from "@/lib/listing";
import { collectionMintProgress } from "@/lib/collectionSupply";
import { ItemBalance } from "@/lib/models/ItemBalance";
import { Listing } from "@/lib/models/Listing";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { recalculateCollectionFloor } from "@/lib/floorPrice";

// ERC-1155 resale listings live in their own collection (not embedded on
// Item, unlike ERC-721) because several holders can each list part of
// their balance for the same item at the same time — see lib/models/Listing.ts.

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await connectDB();
  const listings = await Listing.find({ item: id, status: { $in: ["active", "auction"] } })
    .sort({ pricePerUnitEth: 1 })
    .populate("seller", "username address")
    .populate("highestBidder", "username address")
    .lean();
  return NextResponse.json({
    listings: listings.map((l) => ({
      id: String(l._id),
      seller: l.seller,
      quantity: l.quantity,
      filledQuantity: l.filledQuantity,
      remaining: l.quantity - l.filledQuantity,
      pricePerUnitEth: l.pricePerUnitEth,
      buyer: l.buyer,
      deadline: l.deadline,
      nonce: l.nonce,
      signature: l.signature,
      nft: l.nft,
      tokenId: l.tokenId,
      status: l.status,
      isAuction: l.isAuction,
      auctionEndsAt: l.auctionEndsAt,
      highestBidEth: l.highestBidEth,
      highestBidder: l.highestBidder,
    })),
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;

  await connectDB();
  const item = await Item.findById(id);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (item.standard !== "ERC1155") {
    return NextResponse.json({ error: "This item doesn't support quantity-based listings" }, { status: 400 });
  }

  const body = await req.json();
  const quantity = Math.floor(Number(body.quantity));
  const pricePerUnitEth = Number(body.pricePerUnitEth);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Enter a valid quantity" }, { status: 400 });
  }
  if (!Number.isFinite(pricePerUnitEth) || pricePerUnitEth <= 0) {
    return NextResponse.json({ error: "Enter a valid per-unit price" }, { status: 400 });
  }

  const balance = await ItemBalance.findOne({ item: item._id, owner: user._id });
  if (!balance || balance.quantity < quantity) {
    return NextResponse.json({ error: "You don't hold enough of this item to list that quantity" }, { status: 400 });
  }

  const collection = await Collection.findById(item.collection)
    .select("contractAddress maxSupply listingEnabled")
    .lean();
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  const collectionGate = listingGate({
    maxSupply: collection.maxSupply,
    ...(await collectionMintProgress(collection._id)),
    listingEnabled: collection.listingEnabled,
  });
  if (!collectionGate.open) {
    return NextResponse.json(
      { error: `Resale isn't available for this collection yet — ${collectionGate.remaining} still to mint.` },
      { status: 403 }
    );
  }

  // Same rule as ERC-721 resale (see PATCH /api/items/[id]), and the reason
  // it matters most here: an edition's isMinted flips on the first unit
  // sold, so only a unit count can tell whether it has finished minting.
  if (!isItemMintedOut(item)) {
    return NextResponse.json(
      {
        error: `Resale isn't available yet — this edition is listable once all ${item.totalSupply ?? 0} are minted, ${itemMintRemaining(item)} still to mint.`,
      },
      { status: 403 }
    );
  }

  // Auction lots: nothing to sign yet — the seller only signs a Listing1155
  // at settlement, once the winner and final price are actually known.
  if (body.isAuction) {
    const auctionEndsAt = new Date(body.auctionEndsAt);
    if (!(auctionEndsAt.getTime() > Date.now())) {
      return NextResponse.json({ error: "Auction end time must be in the future" }, { status: 400 });
    }
    const nonce = String(body.nonce ?? "");
    if (!nonce) {
      return NextResponse.json({ error: "Missing auction nonce" }, { status: 400 });
    }
    const listing = await Listing.create({
      item: item._id,
      collection: item.collection,
      seller: user._id,
      nft: collection?.contractAddress,
      tokenId: String(item.tokenId),
      quantity,
      filledQuantity: 0,
      pricePerUnitEth, // reserve price per unit
      nonce,
      status: "auction",
      isAuction: true,
      auctionEndsAt,
    });
    await recalculateCollectionFloor(item.collection);
    return NextResponse.json({ id: String(listing._id) }, { status: 201 });
  }

  const listingData = body.listing;
  if (!listingData || typeof body.signature !== "string") {
    return NextResponse.json({ error: "A signed listing authorization is required" }, { status: 400 });
  }
  if (
    String(listingData.tokenId) !== String(item.tokenId) ||
    listingData.seller?.toLowerCase() !== user.address.toLowerCase() ||
    listingData.nft?.toLowerCase() !== collection?.contractAddress?.toLowerCase()
  ) {
    return NextResponse.json({ error: "Listing authorization doesn't match this item" }, { status: 400 });
  }

  const listing = await Listing.create({
    item: item._id,
    collection: item.collection,
    seller: user._id,
    nft: listingData.nft,
    tokenId: String(listingData.tokenId),
    quantity,
    filledQuantity: 0,
    pricePerUnitEth,
    buyer: listingData.buyer && listingData.buyer !== "0x0000000000000000000000000000000000000000" ? listingData.buyer : null,
    deadline: listingData.deadline && Number(listingData.deadline) > 0 ? new Date(Number(listingData.deadline) * 1000) : null,
    nonce: String(listingData.nonce),
    signature: body.signature,
    status: "active",
  });

  await recalculateCollectionFloor(item.collection);

  return NextResponse.json({ id: String(listing._id) }, { status: 201 });
}
