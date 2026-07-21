import { Schema, model, models, Types, InferSchemaType } from "mongoose";

const ItemSchema = new Schema(
  {
    collection: { type: Schema.Types.ObjectId, ref: "Collection", required: true, index: true },
    tokenId: { type: String, default: null },
    isMinted: { type: Boolean, default: false },
    owner: { type: Schema.Types.ObjectId, ref: "User" },
    creator: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    metadataUri: { type: String, default: "" },
    traits: [
      {
        trait_type: String,
        value: String,
        rarity: Number,
      },
    ],
    status: {
      type: String,
      enum: ["not_listed", "fixed_price", "auction", "sold"],
      default: "not_listed",
      index: true,
    },
    priceEth: { type: Number, default: 0 },
    highestBidEth: { type: Number, default: 0 },
    auctionEndsAt: { type: Date, default: null },
    favoriteCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    voucher: {
      tokenId: String,
      uri: String,
      minPrice: String,
      creator: String,
      royaltyBps: Number,
      signature: String,
      nonce: Number,
    },
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

export type ItemDoc = InferSchemaType<typeof ItemSchema> & { _id: Types.ObjectId };
export const Item = models.Item || model("Item", ItemSchema);
