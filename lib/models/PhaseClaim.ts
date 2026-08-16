import { Schema, model, models, Types, InferSchemaType } from "mongoose";

const PhaseClaimSchema = new Schema(
  {
    collection: { type: Schema.Types.ObjectId, ref: "Collection", required: true, index: true },
    phase: { type: String, enum: ["whitelist", "og", "public"], required: true },
    wallet: { type: String, required: true, lowercase: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PhaseClaimSchema.index({ collection: 1, phase: 1, wallet: 1 }, { unique: true });

export type PhaseClaimDoc = InferSchemaType<typeof PhaseClaimSchema> & { _id: Types.ObjectId };
export const PhaseClaim = models.PhaseClaim || model("PhaseClaim", PhaseClaimSchema);
