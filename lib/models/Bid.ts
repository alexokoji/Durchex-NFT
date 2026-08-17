import { Schema, model, models } from "mongoose";

const BidSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: "Item", required: true, index: true },
    // ERC-1155 only: which specific resale auction lot this bid is against
    // — several auctions (from different sellers) can exist on the same
    // item simultaneously, unlike 721's single item-level auction slot.
    listing: { type: Schema.Types.ObjectId, ref: "Listing", default: null, index: true },
    bidder: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["auction_bid", "offer"], required: true },
    amountEth: { type: Number, required: true },
    // ERC-1155 only: how many units this offer is for (per-unit amountEth
    // still applies — total = amountEth * quantity). Always 1 for 721.
    quantity: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ["active", "accepted", "rejected", "cancelled", "expired"],
      default: "active",
      index: true,
    },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Bid = models.Bid || model("Bid", BidSchema);
