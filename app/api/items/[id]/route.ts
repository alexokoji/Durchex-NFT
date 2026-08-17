import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Item } from "@/lib/models/Item";
import { Collection } from "@/lib/models/Collection";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { recordActivity } from "@/lib/activity";
import { recalculateCollectionFloor } from "@/lib/floorPrice";

// Lists or unlists an already-minted item for resale. Lazy (unminted) items
// get their listing price set at creation via the voucher — this is only
// for items that already exist on-chain and are owned by the caller.
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
  if (!item.isMinted) {
    return NextResponse.json({ error: "Unminted items list automatically when created" }, { status: 400 });
  }

  const body = await req.json();
  if (body.action === "unlist") {
    item.status = "not_listed";
    item.priceEth = 0;
    // Stops the app from ever offering a stale signed authorization again —
    // the on-chain listing itself remains technically fillable until its
    // deadline unless the owner also separately calls cancelListing().
    item.listing = undefined;
  } else {
    const collection = await Collection.findById(item.collection).select("listingEnabled listingOpensAt contractAddress").lean();
    const listingOpen = collection && (collection.listingEnabled || (collection.listingOpensAt && collection.listingOpensAt <= new Date()));
    if (!listingOpen) {
      return NextResponse.json({ error: "Listing is not open yet for this collection" }, { status: 403 });
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
