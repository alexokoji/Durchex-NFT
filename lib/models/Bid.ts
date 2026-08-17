import { Schema, model, models } from "mongoose";

const BidSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: "Item", required: true, index: true },
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
