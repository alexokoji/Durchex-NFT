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
  media?: { url: string; type: string; name: string; size: number };
  traits?: { traitType: string; value: string }[];
  pricingMode: "fixed_price" | "auction" | "not_listed";
  priceEth: number;
  auctionDurationHours?: number;
  tokenId: string;
  metadataUri: string;
  voucher?: {
    tokenId: string;
    uri: string;
    minPrice: string;
    creator: string;
    royaltyBps: number;
    nonce: number;
  };
  signature?: string;
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
  if (!body.collectionId) {
    return NextResponse.json({ error: "Missing collection" }, { status: 400 });
  }
  if (!!body.voucher !== !!body.signature) {
    return NextResponse.json({ error: "A lazy-mint voucher needs both a signature and voucher data" }, { status: 400 });
  }
  if (body.voucher && body.voucher.nonce !== (user.nextVoucherNonce ?? 0)) {
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
  if (String(collection.creator) !== String(user._id)) {
    return NextResponse.json(
      { error: "Only the collection creator can add NFTs to this collection." },
      { status: 403 }
    );
  }
  if (body.voucher && await Item.exists({ collection: collection._id, tokenId: body.tokenId })) {
    return NextResponse.json(
      { error: "That token id was just taken — refresh and try again" },
      { status: 409 }
    );
  }

  const isAuction = !!body.voucher && body.pricingMode === "auction";
  // A collection without a deployed compatible contract is a media draft, not a live listing.
  const status = body.voucher && body.pricingMode !== "not_listed" ? body.pricingMode : "not_listed";
  const auctionEndsAt = isAuction
    ? new Date(Date.now() + (body.auctionDurationHours ?? 24) * 60 * 60 * 1000)
    : null;

  const item = await Item.create({
    collection: collection._id,
    tokenId: body.voucher ? body.tokenId : null,
    isMinted: false,
    owner: user._id,
    creator: user._id,
    name,
    description: body.description ?? "",
    mediaUrl: body.media?.url ?? "",
    mediaType: body.media?.type ?? "",
    mediaName: body.media?.name ?? "",
    mediaSize: body.media?.size ?? 0,
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
    voucher: body.voucher ? { ...body.voucher, signature: body.signature } : undefined,
  });

  await Promise.all([
    body.voucher ? User.updateOne({ _id: user._id }, { $inc: { nextVoucherNonce: 1 } }) : Promise.resolve(),
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
