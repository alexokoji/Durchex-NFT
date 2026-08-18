import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { User } from "@/lib/models/User";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { recordActivity } from "@/lib/activity";
import { recalculateCollectionFloor } from "@/lib/floorPrice";
import { nextVoucherNonce } from "@/lib/web3/voucherNonce";

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
    deadline: string;
  };
  // ERC-1155 only: a reusable EditionVoucher, plus how many editions exist in total.
  editionVoucher?: {
    tokenId: string;
    uri: string;
    minPrice: string;
    creator: string;
    royaltyBps: number;
    maxSupply: number;
    nonce: string;
    deadline: string;
  };
  totalSupply?: number;
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

  if (collection.standard === "ERC1155") {
    return createEdition(body, collection, user);
  }

  if (!!body.voucher !== !!body.signature) {
    return NextResponse.json({ error: "A lazy-mint voucher needs both a signature and voucher data" }, { status: 400 });
  }
  // Validate against the nonce the *contract* will demand, not a per-user
  // counter. The counter is global while the contract tracks nonces per
  // deployment, so once more than one chain is live the two drift and every
  // voucher signed afterwards reverts on redemption.
  if (body.voucher) {
    let expectedNonce: number;
    try {
      expectedNonce = await nextVoucherNonce({
        creatorId: user._id,
        creatorAddress: user.address,
        contractAddress: collection.contractAddress,
        chainId: collection.chainId,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Couldn't verify the voucher nonce" },
        { status: 503 }
      );
    }
    if (body.voucher.nonce !== expectedNonce) {
      return NextResponse.json(
        { error: `Voucher nonce is stale — expected ${expectedNonce}. Refresh and try again.` },
        { status: 409 }
      );
    }
  }
  // tokenId must be unique across ALL collections, not just this one —
  // collections share the same deployed DurchexNFT contract by default
  // (see lib/web3/deployedContract.ts), so tokenId is a contract-wide slot.
  if (body.voucher && await Item.exists({ tokenId: body.tokenId })) {
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
    standard: "ERC721",
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
    Collection.updateOne({ _id: collection._id }, { $inc: { "stats.items": 1 } }),
  ]);
  if (status !== "not_listed") await recalculateCollectionFloor(collection._id);

  return NextResponse.json({ id: String(item._id) }, { status: 201 });
}

// ERC-1155 items are always created via a reusable EditionVoucher (no
// draft/not-listed state, no auctions — a creator sets a per-unit price
// and a total supply, and different buyers mint their own share).
async function createEdition(
  body: CreateItemBody,
  collection: InstanceType<typeof Collection>,
  user: InstanceType<typeof User>
) {
  const totalSupply = Math.floor(Number(body.totalSupply ?? 0));
  if (totalSupply <= 0) {
    return NextResponse.json({ error: "Total supply must be greater than 0" }, { status: 400 });
  }
  if (!Number.isFinite(body.priceEth) || body.priceEth <= 0) {
    return NextResponse.json({ error: "Enter a valid per-unit price" }, { status: 400 });
  }
  if (!body.editionVoucher || !body.signature) {
    return NextResponse.json({ error: "A signed edition voucher is required" }, { status: 400 });
  }
  if (await Item.exists({ tokenId: body.tokenId })) {
    return NextResponse.json(
      { error: "That token id was just taken — refresh and try again" },
      { status: 409 }
    );
  }

  const item = await Item.create({
    collection: collection._id,
    standard: "ERC1155",
    tokenId: body.tokenId,
    totalSupply,
    mintedSupply: 0,
    isMinted: false,
    creator: user._id,
    name: String(body.name ?? "").trim(),
    description: body.description ?? "",
    mediaUrl: body.media?.url ?? "",
    mediaType: body.media?.type ?? "",
    mediaName: body.media?.name ?? "",
    mediaSize: body.media?.size ?? 0,
    metadataUri: body.metadataUri,
    traits: (body.traits ?? [])
      .filter((t) => t.traitType.trim() && t.value.trim())
      .map((t) => ({ trait_type: t.traitType.trim(), value: t.value.trim() })),
    status: "fixed_price",
    priceEth: body.priceEth, // per unit
    favoriteCount: 0,
    viewCount: 0,
    editionVoucher: { ...body.editionVoucher, signature: body.signature },
  });

  await Promise.all([
    recordActivity({ type: "list", item: item._id, from: user._id, priceEth: body.priceEth }),
    Collection.updateOne({ _id: collection._id }, { $inc: { "stats.items": 1 } }),
  ]);
  await recalculateCollectionFloor(collection._id);

  return NextResponse.json({ id: String(item._id) }, { status: 201 });
}
