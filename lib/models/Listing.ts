import { Schema, model, models, Types, InferSchemaType } from "mongoose";

// A dedicated resale-listing entity for ERC-1155 items. Unlike ERC-721
// (where an item has exactly one owner/seller at a time, so the signed
// listing can live directly on Item — see Item.listing), an ERC-1155 token
// can have several holders each independently listing part of their
// balance for sale simultaneously, so listings need their own collection
// rather than a single embedded field.
const ListingSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: "Item", required: true, index: true },
    collection: { type: Schema.Types.ObjectId, ref: "Collection", required: true, index: true },
    seller: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    nft: { type: String, required: true },
    tokenId: { type: String, required: true },
    // Total units authorized under this one seller signature.
    quantity: { type: Number, required: true },
    // Cached count of how many units have sold so far under this listing —
    // authoritative on-chain state lives in the contract's
    // listing1155Filled mapping; this is a best-effort local mirror kept
    // in sync by chainSync.ts, used for display/floor-price purposes.
    filledQuantity: { type: Number, default: 0 },
    // pricePerUnitEth doubles as the auction reserve price while
    // isAuction && status === "auction" — the actual per-unit settlement
    // price (highestBidEth / quantity) is only known once the auction ends.
    pricePerUnitEth: { type: Number, required: true },
    buyer: { type: String, default: null }, // restricted buyer address, if any
    deadline: { type: Date, default: null },
    nonce: { type: String, required: true },
    // Auctions have no seller signature yet at creation — nothing to sign
    // until the winner (and therefore the final price) is known. Filled in
    // by the settle step, which is what actually unlocks the on-chain buy.
    signature: { type: String, default: null },
    status: {
      type: String,
      enum: ["active", "auction", "cancelled", "filled", "expired"],
      default: "active",
      index: true,
    },
    isAuction: { type: Boolean, default: false },
    auctionEndsAt: { type: Date, default: null },
    highestBidEth: { type: Number, default: 0 },
    highestBidder: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

ListingSchema.index({ seller: 1, nonce: 1 }, { unique: true });
ListingSchema.index({ item: 1, status: 1 });

export type ListingDoc = InferSchemaType<typeof ListingSchema> & { _id: Types.ObjectId };
export const Listing = models.Listing || model("Listing", ListingSchema);
