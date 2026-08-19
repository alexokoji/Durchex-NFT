import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { Listing } from "@/lib/models/Listing";
import { toItemDetailView } from "@/lib/viewMappers";

/**
 * Resolves the *specific* cheapest currently-valid listing in a collection —
 * deliberately not the cached Collection.stats.floorEth number.
 *
 * "Buy Floor" must bind the purchase to a concrete listing, because the
 * cached figure can be stale the instant it's read (someone else buys the
 * floor NFT). Returning the actual listing means the buyer's transaction is
 * bound to that one item at that one price: if it's gone by the time they
 * confirm, the on-chain call reverts rather than silently buying a pricier
 * NFT.
 *
 * Four listing shapes can be the floor, and all four are considered:
 *   - ERC-721 lazy   (unminted, creator-signed voucher)
 *   - ERC-721 resale (minted, owner-signed listing)
 *   - ERC-1155 primary (edition voucher, per-unit price, supply remaining)
 *   - ERC-1155 resale  (per-unit price, unfilled quantity remaining)
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid collection" }, { status: 400 });
  }

  await connectDB();
  const collection = await Collection.findById(id).select("_id hidden").lean();
  // A hidden collection has no public floor — it is off the marketplace.
  if (!collection || collection.hidden) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  const collectionId = new Types.ObjectId(id);

  // Candidate items: anything the collection currently has listed at a
  // real price. Validity is checked per-shape below rather than in the
  // query, since each shape has different "still fillable" conditions.
  const items = await Item.find({
    collection: collectionId,
    status: "fixed_price",
    priceEth: { $gt: 0 },
  })
    .populate("collection")
    .populate("owner")
    .populate("creator")
    .lean();

  type Candidate = {
    pricePerUnitEth: number;
    kind: "lazy_721" | "resale_721" | "primary_1155" | "resale_1155";
    item: (typeof items)[number];
    listingId?: string;
    availableQuantity?: number;
    // Signed Listing1155 payload — the buyer's on-chain call needs it, and
    // it only exists for the resale_1155 shape.
    listing1155?: {
      nft: string;
      tokenId: string;
      seller: string;
      buyer: string | null;
      quantity: string;
      pricePerUnit: string;
      deadline: string;
      nonce: string;
      signature: string;
    };
  };
  const candidates: Candidate[] = [];

  for (const item of items) {
    const isFuture = (deadline?: string | null) => !!deadline && Number(deadline) > nowSec;

    if (item.standard === "ERC1155") {
      // Primary sale: still fillable only while supply remains and the
      // edition voucher hasn't expired.
      const ev = item.editionVoucher;
      const remaining = (item.totalSupply ?? 0) - (item.mintedSupply ?? 0);
      if (ev?.signature && remaining > 0 && isFuture(ev.deadline)) {
        candidates.push({
          pricePerUnitEth: item.priceEth,
          kind: "primary_1155",
          item,
          availableQuantity: remaining,
        });
      }
      continue;
    }

    if (!item.isMinted) {
      // Lazy 721: a voucher with no deadline predates the redeployed
      // contract and can never be redeemed against it, so it is not a
      // valid listing and must not set the floor.
      if (item.voucher?.signature && isFuture(item.voucher.deadline)) {
        candidates.push({ pricePerUnitEth: item.priceEth, kind: "lazy_721", item });
      }
      continue;
    }

    // Resale 721: needs a live owner-signed listing that hasn't expired.
    // Seller-still-owns is additionally enforced on-chain at fill time.
    const l = item.listing;
    if (l?.signature && (Number(l.deadline) === 0 || isFuture(l.deadline))) {
      candidates.push({ pricePerUnitEth: item.priceEth, kind: "resale_721", item });
    }
  }

  // ERC-1155 resale listings live in their own collection (several holders
  // can each be selling part of their balance at different unit prices).
  const resale1155 = await Listing.find({
    collection: collectionId,
    status: "active",
    pricePerUnitEth: { $gt: 0 },
    signature: { $ne: null },
  })
    .populate("seller", "username address")
    .lean();

  const resaleItemIds = resale1155.map((l) => l.item);
  const resaleItems = resaleItemIds.length
    ? await Item.find({ _id: { $in: resaleItemIds } })
        .populate("collection")
        .populate("owner")
        .populate("creator")
        .lean()
    : [];
  const resaleItemById = new Map(resaleItems.map((i) => [String(i._id), i]));

  for (const l of resale1155) {
    // "Still has unsold units" is filtered here rather than in the query:
    // comparing two fields needs $expr, which mongoose fails to cast
    // against this schema (same breakage as the auction bid guard).
    if (l.filledQuantity >= l.quantity) continue;
    if (l.deadline && new Date(l.deadline) <= now) continue; // expired
    const item = resaleItemById.get(String(l.item));
    if (!item) continue;
    const sellerAddress = (l.seller as { address?: string } | null)?.address;
    if (!sellerAddress) continue;
    candidates.push({
      pricePerUnitEth: l.pricePerUnitEth,
      kind: "resale_1155",
      item,
      listingId: String(l._id),
      availableQuantity: l.quantity - l.filledQuantity,
      listing1155: {
        nft: l.nft,
        tokenId: l.tokenId,
        seller: sellerAddress,
        buyer: l.buyer,
        quantity: String(l.quantity),
        pricePerUnit: String(Math.round(l.pricePerUnitEth * 1e18)),
        deadline: String(l.deadline ? Math.floor(new Date(l.deadline).getTime() / 1000) : 0),
        nonce: l.nonce,
        signature: l.signature,
      },
    });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ floor: null });
  }

  candidates.sort((a, b) => a.pricePerUnitEth - b.pricePerUnitEth);
  const best = candidates[0];

  return NextResponse.json({
    floor: {
      kind: best.kind,
      pricePerUnitEth: best.pricePerUnitEth,
      availableQuantity: best.availableQuantity ?? 1,
      listingId: best.listingId ?? null,
      listing1155: best.listing1155 ?? null,
      item: toItemDetailView(best.item as never),
    },
    // How many other listings sit at this same price — useful context for
    // the buyer, and a hint that losing a race isn't necessarily fatal.
    tiedAtFloor: candidates.filter((c) => c.pricePerUnitEth === best.pricePerUnitEth).length,
  });
}
