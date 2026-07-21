import { Schema, model, models, InferSchemaType } from "mongoose";

const UserSchema = new Schema(
  {
    address: { type: String, required: true, unique: true, lowercase: true, index: true },
    username: { type: String, required: true, unique: true },
    bio: { type: String, default: "" },
    avatarSeed: { type: String, default: "" },
    bannerSeed: { type: String, default: "" },
    isVerified: { type: Boolean, default: false },
    socials: {
      twitter: String,
      discord: String,
      website: String,
      instagram: String,
    },
    nonce: { type: String, default: "" },
    followerCount: { type: Number, default: 0 },
    followingCount: { type: Number, default: 0 },
    // Per-creator nonce for lazy-mint EIP-712 vouchers (mirrors the on-chain
    // `nonces[creator]` mapping in DurchexNFT.sol once that's deployed —
    // tracked here for now since there's no live contract to read it from).
    nextVoucherNonce: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof UserSchema>;
export const User = models.User || model("User", UserSchema);
