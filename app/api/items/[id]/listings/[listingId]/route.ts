import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Listing } from "@/lib/models/Listing";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { recalculateCollectionFloor } from "@/lib/floorPrice";

/**
 * Withdraws an ERC-1155 resale listing.
 *
 * Only stops Durchex offering it. The seller's signature stays valid until
 * its deadline unless they also cancel it on-chain, so the response says
 * so rather than implying the listing has been destroyed — a seller who
 * believes they are fully withdrawn and then gets filled has been misled
 * by us.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; listingId: string }> }
) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { listingId } = await context.params;
  if (!Types.ObjectId.isValid(listingId)) {
    return NextResponse.json({ error: "Invalid listing" }, { status: 400 });
  }

  await connectDB();
  const listing = await Listing.findById(listingId);
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  if (String(listing.seller) !== String(user._id)) {
    return NextResponse.json({ error: "Only the seller can withdraw this listing" }, { status: 403 });
  }
  if (listing.status !== "active" && listing.status !== "auction") {
    return NextResponse.json({ error: "This listing is no longer live." }, { status: 409 });
  }
  if (listing.isAuction && listing.highestBidEth > 0) {
    return NextResponse.json(
      { error: "This auction already has a bid and can't be withdrawn." },
      { status: 409 }
    );
  }

  listing.status = "cancelled";
  await listing.save();
  await recalculateCollectionFloor(listing.collection);

  return NextResponse.json({ cancelled: true, id: String(listing._id) });
}
