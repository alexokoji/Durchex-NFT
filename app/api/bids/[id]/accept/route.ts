import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Item } from "@/lib/models/Item";
import { Bid } from "@/lib/models/Bid";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { createNotification } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in to accept an offer" }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();

  const bid = await Bid.findById(id);
  if (!bid || bid.type !== "offer" || bid.status !== "active") {
    return NextResponse.json({ error: "This offer is no longer available" }, { status: 404 });
  }

  const item = await Item.findById(bid.item);
  if (!item || String(item.owner) !== String(user._id)) {
    return NextResponse.json({ error: "Only the current owner can accept this offer" }, { status: 403 });
  }

  bid.status = "accepted";
  await bid.save();

  await createNotification({
    user: bid.bidder,
    type: "offer_accepted",
    item: item._id,
    fromUser: user._id,
    amountEth: bid.amountEth,
  });

  // Settlement (payment + ownership transfer) happens on-chain once the
  // marketplace contract is deployed — accepting here just records that
  // seller and buyer have agreed off-chain, matching the spec's offer flow
  // (POST /api/bids/[id]/accept "returns settlement calldata").
  return NextResponse.json({ ok: true });
}
