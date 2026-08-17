import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Listing } from "@/lib/models/Listing";
import { User } from "@/lib/models/User";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { createNotification } from "@/lib/notifications";

// Settles an ended ERC-1155 auction lot: the seller signs a Listing1155
// authorizing the actual winner at the actual winning price — nothing
// could be signed at auction-creation time since neither was known yet.
// Once stored, the listing becomes a normal buyer-restricted resale
// listing (status "active"), fillable on-chain only by the winner via the
// existing buyListed1155 path — no new contract function needed.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string; listingId: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { listingId } = await context.params;

  await connectDB();
  const listing = await Listing.findById(listingId);
  if (!listing) return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  if (String(listing.seller) !== String(user._id)) {
    return NextResponse.json({ error: "Only the seller can settle this auction" }, { status: 403 });
  }
  if (!listing.isAuction || listing.status !== "auction") {
    return NextResponse.json({ error: "This listing isn't an open auction" }, { status: 400 });
  }
  if (!listing.auctionEndsAt || listing.auctionEndsAt.getTime() > Date.now()) {
    return NextResponse.json({ error: "The auction hasn't ended yet" }, { status: 400 });
  }
  if (!listing.highestBidder) {
    return NextResponse.json({ error: "No bids were placed — cancel this auction instead of settling it" }, { status: 400 });
  }

  const body = await req.json();
  const listingData = body.listing;
  if (!listingData || typeof body.signature !== "string") {
    return NextResponse.json({ error: "A signed settlement authorization is required" }, { status: 400 });
  }

  const winner = await User.findById(listing.highestBidder);
  if (!winner) return NextResponse.json({ error: "Winning bidder not found" }, { status: 404 });

  if (
    listingData.seller?.toLowerCase() !== user.address.toLowerCase() ||
    listingData.buyer?.toLowerCase() !== winner.address.toLowerCase() ||
    String(listingData.tokenId) !== String(listing.tokenId) ||
    listingData.nft?.toLowerCase() !== listing.nft.toLowerCase() ||
    String(listingData.quantity) !== String(listing.quantity)
  ) {
    return NextResponse.json({ error: "Settlement authorization doesn't match this auction" }, { status: 400 });
  }
  const expectedTotalWei = BigInt(listingData.pricePerUnit) * BigInt(listing.quantity);
  const bidWei = BigInt(Math.round(listing.highestBidEth * 1e18));
  // Rounding slack from float ETH -> wei conversion on both sides.
  if (expectedTotalWei < bidWei - BigInt(1000) || expectedTotalWei > bidWei + BigInt(1000)) {
    return NextResponse.json({ error: "Settlement price doesn't match the winning bid" }, { status: 400 });
  }

  listing.buyer = winner.address;
  listing.pricePerUnitEth = listing.highestBidEth / listing.quantity;
  listing.deadline = listingData.deadline && Number(listingData.deadline) > 0 ? new Date(Number(listingData.deadline) * 1000) : null;
  listing.nonce = String(listingData.nonce);
  listing.signature = body.signature;
  listing.status = "active";
  await listing.save();

  await createNotification({
    user: winner._id,
    type: "bid",
    item: listing.item,
    fromUser: user._id,
    amountEth: listing.highestBidEth,
  });

  return NextResponse.json({ id: String(listing._id), status: listing.status });
}
