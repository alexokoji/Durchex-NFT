import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Item } from "@/lib/models/Item";
import { Collection } from "@/lib/models/Collection";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { recordActivity } from "@/lib/activity";
import { recalculateCollectionFloor } from "@/lib/floorPrice";
import { isItemMintedOut, itemMintRemaining, listingGate } from "@/lib/listing";
import { collectionMintProgress } from "@/lib/collectionSupply";

// Lists, relists, or cancels a listing. Lazy (unminted) items get their
// initial listing price set at creation via the voucher, but their creator
// can still cancel that lazy listing here before it's purchased — only
// *relisting* (the "list for resale" branch below) requires the item to
// already be minted on-chain.
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;

  await connectDB();
  const item = await Item.findById(id);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (String(item.owner) !== String(user._id)) {
    return NextResponse.json({ error: "Only the owner can list this item" }, { status: 403 });
  }

  const body = await req.json();
  if (body.action === "unlist") {
    item.status = "not_listed";
    item.priceEth = 0;
    // Stops the app from ever offering a stale signed authorization again —
    // the on-chain listing/voucher itself remains technically fillable
    // until its deadline unless the owner also separately calls
    // cancelListing()/cancelVoucher() on-chain.
    item.listing = undefined;
  } else {
    if (!item.isMinted) {
      return NextResponse.json({ error: "Unminted items list automatically when created" }, { status: 400 });
    }
    const collection = await Collection.findById(item.collection)
      .select("contractAddress maxSupply listingEnabled")
      .lean();
    if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    // Two conditions, and both are real: this token has to be finished,
    // and the collection's secondary market has to be open at all.
    const gate = listingGate({
      maxSupply: collection.maxSupply,
      ...(await collectionMintProgress(collection._id)),
      listingEnabled: collection.listingEnabled,
    });
    if (!gate.open) {
      return NextResponse.json(
        { error: `Resale isn't available for this collection yet — ${gate.remaining} still to mint.` },
        { status: 403 }
      );
    }
    // Resale opens per item, once every unit of it is on-chain. An ERC-721
    // is one unit, so being minted is enough; an edition of 50 needs all
    // 50, since isMinted flips on the very first purchase.
    if (!isItemMintedOut(item)) {
      return NextResponse.json(
        {
          error: `Resale isn't available yet — this item is fully listable once all of it is minted, ${itemMintRemaining(item)} still to mint.`,
        },
        { status: 403 }
      );
    }

    const priceEth = Number(body.priceEth);
    if (!Number.isFinite(priceEth) || priceEth <= 0) {
      return NextResponse.json({ error: "Enter a valid price" }, { status: 400 });
    }

    const listing = body.listing;
    if (!listing || typeof body.signature !== "string") {
      return NextResponse.json({ error: "A signed listing authorization is required" }, { status: 400 });
    }
    if (
      String(listing.tokenId) !== String(item.tokenId) ||
      listing.seller?.toLowerCase() !== user.address.toLowerCase() ||
      listing.nft?.toLowerCase() !== collection?.contractAddress?.toLowerCase()
    ) {
      return NextResponse.json({ error: "Listing authorization doesn't match this item" }, { status: 400 });
    }

    item.status = "fixed_price";
    item.priceEth = priceEth;
    item.listing = {
      nft: listing.nft,
      tokenId: String(listing.tokenId),
      seller: listing.seller,
      buyer: listing.buyer ?? null,
      price: String(listing.price),
      deadline: String(listing.deadline),
      nonce: String(listing.nonce),
      signature: body.signature,
    };
  }
  await item.save();

  if (item.status === "fixed_price") {
    await recordActivity({ type: "list", item: item._id, from: user._id, priceEth: item.priceEth });
  }
  await recalculateCollectionFloor(item.collection);

  return NextResponse.json({ id: String(item._id), status: item.status, priceEth: item.priceEth });
}
