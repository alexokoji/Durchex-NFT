import { Schema, model, models, Types, InferSchemaType } from "mongoose";

// One application for a verification badge. The profile fields are
// snapshotted at submission rather than read live at review time, so a
// reviewer judges what was actually applied with — an applicant can't
// swap the bio out after a reviewer has looked at it.
const VerificationRequestSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tier: { type: String, enum: ["white", "purple"], required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    nftsCreated: { type: Number, default: 0 },
    submitted: {
      username: String,
      bio: String,
      avatarUrl: String,
      bannerUrl: String,
      socials: {
        twitter: String,
        discord: String,
        website: String,
        instagram: String,
      },
      // Purple only. Held for review and cleared once decided, so an
      // identity document doesn't sit in the database indefinitely.
      idDocumentUrl: String,
    },
    reviewNote: { type: String, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One open application per user — reapplying replaces the pending one
// rather than queueing a second.
VerificationRequestSchema.index({ user: 1, status: 1 });

export type VerificationRequestDoc = InferSchemaType<typeof VerificationRequestSchema> & {
  _id: Types.ObjectId;
};
export const VerificationRequest =
  models.VerificationRequest || model("VerificationRequest", VerificationRequestSchema);
