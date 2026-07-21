import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { User } from "@/lib/models/User";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { recordActivity } from "@/lib/activity";

interface CreateItemBody {
  collectionId: string;
  name: string;
  description?: string;
  traits?: { traitType: string; value: string }[];
  pricingMode: "fixed_price" | "auction" | "not_listed";
  priceEth: number;
  auctionDurationHours?: number;
  tokenId: string;
  metadataUri: string;
  voucher: {
    tokenId: string;
    uri: string;
    minPrice: string;
    creator: string;
    royaltyBps: number;
    nonce: number;
  };
  signature: string;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in to create a listing" }, { status: 401 });
  }

  const body = (await req.json()) as CreateItemBody;
  const name = String(body.name ?? "").trim();
  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Item name is required" }, { status: 400 });
  }
  if (!body.collectionId || !body.voucher || !body.signature) {
    return NextResponse.json({ error: "Missing collection, voucher or signature" }, { status: 400 });
  }
  if (body.voucher.nonce !== (user.nextVoucherNonce ?? 0)) {
    return NextResponse.json(
      { error: "Voucher nonce is stale — refresh and try again" },
      { status: 409 }
    );
  }

  await connectDB();
  const collection = await Collection.findById(body.collectionId);
  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }
  if (await Item.exists({ collection: collection._id, tokenId: body.tokenId })) {
    return NextResponse.json(
      { error: "That token id was just taken — refresh and try again" },
      { status: 409 }
    );
  }

  const isAuction = body.pricingMode === "auction";
  const status = body.pricingMode === "not_listed" ? "not_listed" : body.pricingMode;
  const auctionEndsAt = isAuction
    ? new Date(Date.now() + (body.auctionDurationHours ?? 24) * 60 * 60 * 1000)
    : null;

  const item = await Item.create({
    collection: collection._id,
    tokenId: null,
    isMinted: false,
    owner: user._id,
    creator: user._id,
    name,
    description: body.description ?? "",
    metadataUri: body.metadataUri,
    traits: (body.traits ?? [])
      .filter((t) => t.traitType.trim() && t.value.trim())
      .map((t) => ({ trait_type: t.traitType.trim(), value: t.value.trim() })),
    status,
    priceEth: status === "not_listed" ? 0 : body.priceEth,
    highestBidEth: 0,
    auctionEndsAt,
    favoriteCount: 0,
    viewCount: 0,
    voucher: body.voucher,
  });

  await Promise.all([
    User.updateOne({ _id: user._id }, { $inc: { nextVoucherNonce: 1 } }),
    recordActivity({
      type: "list",
      item: item._id,
      from: user._id,
      priceEth: status === "not_listed" ? null : body.priceEth,
    }),
    Collection.updateOne(
      { _id: collection._id },
      {
        $inc: { "stats.items": 1 },
        ...(status !== "not_listed" &&
        (collection.stats.floorEth === 0 || body.priceEth < collection.stats.floorEth)
          ? { $set: { "stats.floorEth": body.priceEth } }
          : {}),
      }
    ),
  ]);

  return NextResponse.json({ id: String(item._id) }, { status: 201 });
}
