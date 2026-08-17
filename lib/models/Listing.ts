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
    pricePerUnitEth: { type: Number, required: true },
    buyer: { type: String, default: null }, // restricted buyer address, if any
    deadline: { type: Date, default: null },
    nonce: { type: String, required: true },
    signature: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "cancelled", "filled", "expired"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

ListingSchema.index({ seller: 1, nonce: 1 }, { unique: true });
ListingSchema.index({ item: 1, status: 1 });

export type ListingDoc = InferSchemaType<typeof ListingSchema> & { _id: Types.ObjectId };
export const Listing = models.Listing || model("Listing", ListingSchema);
