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

    // Settlement data for type:"offer". An NFT offer is expressed as a
    // DurchexOffers CollectionOffer whose eligible set holds exactly one
    // token (criteriaRoot = leafOf(tokenId)), so it reuses that contract
    // unchanged rather than needing its own. Absent on legacy offers made
    // before settlement existed — those can never be accepted, and the
    // accept route says so rather than pretending to work.
    buyerAddress: { type: String, default: null, lowercase: true },
    nft: { type: String, default: null },
    criteriaRoot: { type: String, default: null },
    nonce: { type: String, default: null },
    deadline: { type: Date, default: null },
    signature: { type: String, default: null },
    // On-chain offer id in DurchexOffersEscrow. Present on ETH-escrowed
    // offers; null on the older WETH signature offers, which is how the
    // accept path tells the two settlement routes apart.
    escrowOfferId: { type: String, default: null },
    chainId: { type: Number, default: null },
  },
  { timestamps: true }
);

export const Bid = models.Bid || model("Bid", BidSchema);
