import { Schema, model, models, Types, InferSchemaType } from "mongoose";

/**
 * A buyer's standing offer to purchase *any eligible NFT* from a
 * collection — deliberately a separate model from Bid (which is
 * item-scoped). Overloading Bid would make the relationship ambiguous:
 * an NFT offer must reference exactly one item, a collection offer must
 * reference none.
 *
 * `criteriaRoot` is a merkle root over the eligible token ids, signed into
 * the on-chain offer. It carries two jobs at once:
 *  - collection membership, which cannot be expressed on-chain any other
 *    way here, because many collections share one deployed NFT contract
 *  - optional trait/rarity criteria, by simply narrowing the set
 */
const CollectionOfferSchema = new Schema(
  {
    collection: { type: Schema.Types.ObjectId, ref: "Collection", required: true, index: true },
    buyer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    buyerAddress: { type: String, required: true, lowercase: true },

    pricePerItemEth: { type: Number, required: true },
    currency: { type: String, default: "WETH" },
    quantity: { type: Number, required: true },
    // Mirror of the contract's offerFilled counter, kept in sync by the
    // accept flow. The contract remains authoritative.
    filledQuantity: { type: Number, default: 0 },

    // Human-readable description of what the merkle root encodes, e.g.
    // { traitType: "Rarity", values: ["Rare", "Legendary"] }. Null means
    // every item in the collection is eligible.
    criteria: { type: Schema.Types.Mixed, default: null },
    criteriaRoot: { type: String, required: true },
    // The exact token ids the root commits to, so the server can rebuild a
    // merkle proof for a seller without re-deriving eligibility.
    eligibleTokenIds: { type: [String], default: [] },

    nft: { type: String, required: true },
    isERC1155: { type: Boolean, default: false },
    chainId: { type: Number, required: true },
    nonce: { type: String, required: true },
    deadline: { type: Date, default: null },
    // Required only for the legacy WETH offers; an escrowed ETH offer is
    // authorised by its on-chain deposit rather than a signature.
    signature: { type: String, default: null },
    escrowOfferId: { type: String, default: null },

    status: {
      type: String,
      enum: ["active", "filled", "cancelled", "expired"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

CollectionOfferSchema.index({ buyerAddress: 1, nonce: 1 }, { unique: true });
CollectionOfferSchema.index({ collection: 1, status: 1, pricePerItemEth: -1 });

export type CollectionOfferDoc = InferSchemaType<typeof CollectionOfferSchema> & { _id: Types.ObjectId };
export const CollectionOffer = models.CollectionOffer || model("CollectionOffer", CollectionOfferSchema);
