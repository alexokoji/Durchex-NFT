import { Schema, model, models, InferSchemaType } from "mongoose";

// Singleton document (a single row, always looked up with no filter).
const PlatformSettingsSchema = new Schema(
  {
    royaltyCapBps: { type: Number, default: 3000 },
  },
  { timestamps: true }
);

export type PlatformSettingsDoc = InferSchemaType<typeof PlatformSettingsSchema>;
export const PlatformSettings = models.PlatformSettings || model("PlatformSettings", PlatformSettingsSchema);
