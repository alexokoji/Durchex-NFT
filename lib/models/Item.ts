import { Schema, model, models, Types, InferSchemaType } from "mongoose";

const ItemSchema = new Schema(
  {
    collection: { type: Schema.Types.ObjectId, ref: "Collection", required: true, index: true },
    tokenId: { type: String, default: null },
    // "ERC721": single owner, tracked via `owner` below (unchanged).
    // "ERC1155": many simultaneous owners, each holding some quantity —
    // tracked via the ItemBalance collection instead; `owner` is unused.
    standard: { type: String, enum: ["ERC721", "ERC1155"], default: "ERC721" },
    // ERC-1155 only: total editions this token will ever have, and how
    // many have actually been lazy-minted via the primary sale so far.
    totalSupply: { type: Number, default: 0 },
    mintedSupply: { type: Number, default: 0 },
    isMinted: { type: Boolean, default: false },
    owner: { type: Schema.Types.ObjectId, ref: "User" },
    creator: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    mediaUrl: { type: String, default: "" },
    mediaType: { type: String, default: "" },
    mediaName: { type: String, default: "" },
    mediaSize: { type: Number, default: 0 },
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
    // Set only when a sale actually settles on-chain (chainSync.ts) — kept
    // separate from priceEth (the current listing ask) so a past sale price
    // never gets mistaken for an active listing once the item is relisted.
    lastSalePriceEth: { type: Number, default: null },
    // Guards handleResale against reprocessing the same settlement twice
    // (e.g. a retried /api/purchases/confirm call for the same tx).
    lastSaleTxHash: { type: String, default: null },
    highestBidEth: { type: Number, default: 0 },
    auctionEndsAt: { type: Date, default: null },
    favoriteCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    // ERC-721 lazy-mint voucher: single-use, one buyer redeems it once.
    voucher: {
      tokenId: String,
      uri: String,
      minPrice: String,
      creator: String,
      royaltyBps: Number,
      signature: String,
      nonce: Number,
      deadline: String,
    },
    // ERC-1155 lazy-mint voucher: reusable across many buyers, each
    // redeeming their own quantity, until totalSupply sells out.
    editionVoucher: {
      tokenId: String,
      uri: String,
      minPrice: String, // per unit
      creator: String,
      royaltyBps: Number,
      maxSupply: Number,
      signature: String,
      nonce: String,
      deadline: String,
    },
    // A seller-signed EIP-712 authorization for the marketplace contract's
    // buyListed(Listing,signature) — set whenever an already-minted item is
    // listed for resale, so the buyer's purchase call carries a price the
    // seller actually agreed to rather than trusting a bare DB value.
    // Cleared on unlist so the app never re-surfaces a stale one.
    listing: {
      nft: String,
      tokenId: String,
      seller: String,
      buyer: { type: String, default: null },
      price: String,
      deadline: String,
      nonce: String,
      signature: String,
    },
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

export type ItemDoc = InferSchemaType<typeof ItemSchema> & { _id: Types.ObjectId };
export const Item = models.Item || model("Item", ItemSchema);
