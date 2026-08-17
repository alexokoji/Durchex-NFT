import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Item } from "@/lib/models/Item";
import { Bid } from "@/lib/models/Bid";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { recordActivity } from "@/lib/activity";
import { createNotification } from "@/lib/notifications";

const OFFER_EXPIRY_DAYS = 7;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in to place a bid or offer" }, { status: 401 });
  }

  const body = await req.json();
  const itemId = String(body.itemId ?? "");
  const type = body.type === "auction_bid" ? "auction_bid" : "offer";
  const amountEth = Number(body.amountEth);

  if (!itemId || !Number.isFinite(amountEth) || amountEth <= 0) {
    return NextResponse.json({ error: "A valid item and amount are required" }, { status: 400 });
  }

  await connectDB();
  const item = await Item.findById(itemId);
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  if (String(item.owner) === String(user._id)) {
    return NextResponse.json({ error: "You already own this item" }, { status: 400 });
  }

  if (type === "auction_bid") {
    if (item.status !== "auction") {
      return NextResponse.json({ error: "This item isn't in a live auction" }, { status: 400 });
    }
    if (item.auctionEndsAt && item.auctionEndsAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "This auction has ended" }, { status: 400 });
    }
    const currentHigh = item.highestBidEth || item.priceEth || 0;
    if (amountEth <= currentHigh) {
      return NextResponse.json(
        { error: `Bid must be higher than the current bid of ${currentHigh} ETH` },
        { status: 400 }
      );
    }
  } else if (item.status === "sold") {
    return NextResponse.json({ error: "This item has already sold" }, { status: 400 });
  }

  // Two concurrent bids can both pass the check above against the same
  // stale read — re-check and update atomically so the higher bid always
  // wins regardless of request ordering, instead of "last .save() wins."
  if (type === "auction_bid") {
    const updated = await Item.findOneAndUpdate(
      {
        _id: item._id,
        status: "auction",
        $or: [{ auctionEndsAt: null }, { auctionEndsAt: { $gt: new Date() } }],
        $expr: {
          $gt: [amountEth, { $cond: [{ $gt: ["$highestBidEth", 0] }, "$highestBidEth", "$priceEth"] }],
        },
      },
      { $set: { highestBidEth: amountEth } }
    );
    if (!updated) {
      return NextResponse.json({ error: "A higher bid was placed first — refresh and try again" }, { status: 409 });
    }
  }

  // Find the previous highest bidder (if any) before we place the new bid,
  // so we can notify them they've been outbid.
  const previousTopBid =
    type === "auction_bid"
      ? await Bid.findOne({ item: item._id, type: "auction_bid", status: "active" }).sort({
          amountEth: -1,
        })
      : null;

  const bid = await Bid.create({
    item: item._id,
    bidder: user._id,
    type,
    amountEth,
    expiresAt:
      type === "offer" ? new Date(Date.now() + OFFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000) : null,
  });

  await recordActivity({
    type: type === "auction_bid" ? "bid" : "offer",
    item: item._id,
    from: user._id,
    priceEth: amountEth,
  });

  await createNotification({
    user: item.owner,
    type: type === "auction_bid" ? "bid" : "offer",
    item: item._id,
    fromUser: user._id,
    amountEth,
  });

  if (previousTopBid && String(previousTopBid.bidder) !== String(user._id)) {
    await createNotification({
      user: previousTopBid.bidder,
      type: "outbid",
      item: item._id,
      fromUser: user._id,
      amountEth,
    });
  }

  return NextResponse.json({ id: String(bid._id) }, { status: 201 });
}
