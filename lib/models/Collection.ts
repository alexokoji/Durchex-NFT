import { Schema, model, models, Types, InferSchemaType } from "mongoose";

const CollectionSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    logoUrl: { type: String, default: "" },
    bannerUrl: { type: String, default: "" },
    contractAddress: { type: String, default: "" },
    contractType: { type: String, enum: ["lazy", "drop"], default: "lazy" },
    maxSupply: { type: Number, default: 0 },
    payoutRecipients: [
      {
        address: String,
        shareBps: Number,
      },
    ],
    chainId: { type: Number, default: 80002 }, // Polygon Amoy testnet
    standard: { type: String, enum: ["ERC721", "ERC1155"], default: "ERC721" },
    creator: { type: Schema.Types.ObjectId, ref: "User" },
    category: {
      type: String,
      enum: ["art", "pfp", "gaming", "music", "photography", "sports", "virtual-worlds", "collectibles"],
      required: true,
    },
    royaltyBps: { type: Number, default: 500 },
    mintPhases: {
      // "whitelist" = GTD: every allowlisted wallet is guaranteed its
      // walletLimit any time the phase is live — allocation is a supply
      // cap, not something wallets race each other for.
      whitelist: {
        enabled: { type: Boolean, default: false },
        priceEth: { type: Number, default: 0 },
        allocation: { type: Number, default: 0 },
        walletLimit: { type: Number, default: 0 },
        allowlist: { type: [String], default: [] },
        minted: { type: Number, default: 0 },
        startsAt: { type: Date, default: null },
        endsAt: { type: Date, default: null },
      },
      // "og" = FCFS: allowlisted, but a shared limited pool — first come,
      // first served, and the phase auto-closes once it sells out.
      og: {
        enabled: { type: Boolean, default: false },
        priceEth: { type: Number, default: 0 },
        allocation: { type: Number, default: 0 },
        walletLimit: { type: Number, default: 0 },
        allowlist: { type: [String], default: [] },
        minted: { type: Number, default: 0 },
        startsAt: { type: Date, default: null },
        endsAt: { type: Date, default: null },
      },
      // "public" = open FCFS: same sold-out-closes behavior as og, no allowlist.
      public: {
        enabled: { type: Boolean, default: false },
        priceEth: { type: Number, default: 0 },
        allocation: { type: Number, default: 0 },
        walletLimit: { type: Number, default: 0 },
        minted: { type: Number, default: 0 },
        startsAt: { type: Date, default: null },
        endsAt: { type: Date, default: null },
      },
    },
    verified: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    hidden: { type: Boolean, default: false },
    // Creator-controlled: when false, no item in this collection can be
    // listed for sale (minting/lazy-listing on /create is unaffected).
    // listingOpensAt lets a creator schedule listing to auto-enable later
    // without an admin/cron needing to flip listingEnabled by hand.
    listingEnabled: { type: Boolean, default: true },
    listingOpensAt: { type: Date, default: null },
    // Set on a handful of collections to feature them on /drops. Null on
    // everything else — most collections were never a scheduled "drop".
    dropStartsAt: { type: Date, default: null },
    dropEndsAt: { type: Date, default: null },
    stats: {
      floorEth: { type: Number, default: 0 },
      volume24hEth: { type: Number, default: 0 },
      volume7dEth: { type: Number, default: 0 },
      totalVolumeEth: { type: Number, default: 0 },
      volumeChangePct: { type: Number, default: 0 },
      owners: { type: Number, default: 0 },
      items: { type: Number, default: 0 },
      sales: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export type CollectionDoc = InferSchemaType<typeof CollectionSchema> & { _id: Types.ObjectId };
export const Collection = models.Collection || model("Collection", CollectionSchema);
