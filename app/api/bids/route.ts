import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Item } from "@/lib/models/Item";
import { Bid } from "@/lib/models/Bid";
import { Listing } from "@/lib/models/Listing";
import { Collection } from "@/lib/models/Collection";
import {
  COLLECTION_OFFER_TYPES,
  OFFER_DOMAIN_NAME,
  OFFER_DOMAIN_VERSION,
  leafOf,
  offersAddressFor,
} from "@/lib/web3/offerCriteria";
import { parseEther, verifyTypedData } from "viem";
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
  const quantity = Math.max(1, Math.floor(Number(body.quantity ?? 1)));

  if (!itemId || !Number.isFinite(amountEth) || amountEth <= 0) {
    return NextResponse.json({ error: "A valid item and amount are required" }, { status: 400 });
  }

  await connectDB();
  const item = await Item.findById(itemId);
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  // ERC-1155 holders can still offer to acquire more units, so this
  // "already own it" guard only makes sense for single-owner 721 items.
  if (item.standard === "ERC721" && String(item.owner) === String(user._id)) {
    return NextResponse.json({ error: "You already own this item" }, { status: 400 });
  }

  // ERC-1155 auction lots are bid on per-Listing (several can exist on the
  // same item from different sellers), not via the item's single auction
  // slot — a separate path from the 721 flow below.
  if (type === "auction_bid" && item.standard === "ERC1155") {
    const listingId = String(body.listingId ?? "");
    const listing = listingId ? await Listing.findById(listingId) : null;
    if (!listing || String(listing.item) !== String(item._id) || !listing.isAuction) {
      return NextResponse.json({ error: "This auction lot doesn't exist" }, { status: 404 });
    }
    if (listing.status !== "auction" || (listing.auctionEndsAt && listing.auctionEndsAt.getTime() < Date.now())) {
      return NextResponse.json({ error: "This auction has ended" }, { status: 400 });
    }
    if (String(listing.seller) === String(user._id)) {
      return NextResponse.json({ error: "You can't bid on your own auction" }, { status: 400 });
    }

    // Same atomic "beat the current high" guard as the 721 item-level
    // auction path, but expressed without $expr/$cond — both branches
    // written out explicitly, since $expr comparison casting against this
    // schema was throwing (see git history for the diagnosis).
    const updated = await Listing.findOneAndUpdate(
      {
        _id: listing._id,
        status: "auction",
        $or: [
          { highestBidEth: { $gt: 0, $lt: amountEth } },
          { highestBidEth: { $lte: 0 }, pricePerUnitEth: { $lt: amountEth } },
        ],
      },
      { $set: { highestBidEth: amountEth, highestBidder: user._id } }
    );
    if (!updated) {
      const currentHigh = listing.highestBidEth || listing.pricePerUnitEth || 0;
      return NextResponse.json(
        { error: `Bid must be higher than the current bid of ${currentHigh} ETH` },
        { status: 409 }
      );
    }

    const previousTopBid = await Bid.findOne({ listing: listing._id, type: "auction_bid", status: "active" }).sort({
      amountEth: -1,
    });

    const bid = await Bid.create({
      item: item._id,
      listing: listing._id,
      bidder: user._id,
      type: "auction_bid",
      amountEth,
      quantity: listing.quantity,
    });

    await recordActivity({ type: "bid", item: item._id, from: user._id, priceEth: amountEth, quantity: listing.quantity });
    await createNotification({ user: listing.seller, type: "bid", item: item._id, fromUser: user._id, amountEth });
    if (previousTopBid && String(previousTopBid.bidder) !== String(user._id)) {
      await createNotification({ user: previousTopBid.bidder, type: "outbid", item: item._id, fromUser: user._id, amountEth });
    }

    return NextResponse.json({ id: String(bid._id) }, { status: 201 });
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

  // An offer must be a real, signed, WETH-backed commitment — otherwise
  // accepting it later can't move any money, which is exactly how this
  // used to be broken. The eligible set is derived here from the item's own
  // tokenId so a buyer can't sign an offer that covers anything else.
  let offerSettlement: Record<string, unknown> = {};
  if (type === "offer") {
    if (!item.isMinted || !item.tokenId) {
      return NextResponse.json(
        { error: "This NFT hasn't been minted yet, so an offer can't be secured against it" },
        { status: 400 }
      );
    }
    if (typeof body.signature !== "string" || !body.nonce || !body.criteriaRoot) {
      return NextResponse.json({ error: "A signed offer is required" }, { status: 400 });
    }
    const collection = await Collection.findById(item.collection).select("contractAddress chainId").lean();
    const expectedRoot = leafOf(String(item.tokenId));
    if (String(body.criteriaRoot).toLowerCase() !== expectedRoot.toLowerCase()) {
      return NextResponse.json(
        { error: "Offer doesn't match this NFT — refresh and try again" },
        { status: 409 }
      );
    }
    // The signature is what actually moves money at settlement, so it is
    // checked here rather than taken on trust. Storing an unverifiable one
    // shows a live offer that can never be filled, and the seller only
    // discovers that by spending gas on a reverting accept.
    const deadlineSeconds = body.deadline ? BigInt(String(body.deadline)) : BigInt(0);
    const offersAddress = offersAddressFor(collection?.chainId);
    if (!offersAddress) {
      return NextResponse.json({ error: "Offers aren't supported on this network" }, { status: 400 });
    }
    const signatureValid = await verifyTypedData({
      address: user.address as `0x${string}`,
      domain: {
        name: OFFER_DOMAIN_NAME,
        version: OFFER_DOMAIN_VERSION,
        chainId: collection?.chainId ?? 1,
        verifyingContract: offersAddress,
      },
      types: COLLECTION_OFFER_TYPES,
      primaryType: "CollectionOffer",
      message: {
        nft: collection?.contractAddress as `0x${string}`,
        isERC1155: item.standard === "ERC1155",
        criteriaRoot: expectedRoot,
        pricePerItem: parseEther(String(amountEth)),
        quantity: BigInt(item.standard === "ERC1155" ? quantity : 1),
        deadline: deadlineSeconds,
        nonce: BigInt(String(body.nonce)),
        buyer: user.address as `0x${string}`,
      },
      signature: body.signature as `0x${string}`,
    }).catch(() => false);
    if (!signatureValid) {
      return NextResponse.json(
        { error: "That signature doesn't match the offer — try signing again." },
        { status: 400 }
      );
    }

    offerSettlement = {
      buyerAddress: user.address,
      nft: collection?.contractAddress,
      criteriaRoot: expectedRoot,
      nonce: String(body.nonce),
      deadline: body.deadline ? new Date(Number(body.deadline) * 1000) : null,
      signature: body.signature,
      chainId: collection?.chainId,
    };
  }

  const bid = await Bid.create({
    item: item._id,
    bidder: user._id,
    type,
    amountEth,
    quantity: item.standard === "ERC1155" ? quantity : 1,
    expiresAt:
      type === "offer"
        ? (offerSettlement.deadline as Date | null) ??
          new Date(Date.now() + OFFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
        : null,
    ...offerSettlement,
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
