import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Listing } from "@/lib/models/Listing";
import { Item } from "@/lib/models/Item";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { recalculateCollectionFloor } from "@/lib/floorPrice";

// Marks a 1155 resale listing cancelled in the DB so the app stops
// offering it. The seller should also call cancelListing1155 on-chain
// (same residual-risk caveat as ERC-721 unlisting — see Item.listing).
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string; listingId: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { listingId } = await context.params;

  await connectDB();
  const listing = await Listing.findById(listingId);
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  if (String(listing.seller) !== String(user._id)) {
    return NextResponse.json({ error: "Only the seller can cancel this listing" }, { status: 403 });
  }

  listing.status = "cancelled";
  await listing.save();

  const item = await Item.findById(listing.item).select("collection").lean();
  if (item) await recalculateCollectionFloor(item.collection);

  return NextResponse.json({ id: String(listing._id), status: listing.status });
}
