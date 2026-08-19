import { Schema, model, models, InferSchemaType } from "mongoose";

// Singleton document (a single row, always looked up with no filter).
const PlatformSettingsSchema = new Schema(
  {
    royaltyCapBps: { type: Number, default: 3000 },
    // Master switch for public creation. Off means only wallets on
    // creationAllowlist can create collections or items — used to keep the
    // marketplace closed while the team seeds it, then opened once.
    creationEnabled: { type: Boolean, default: true },
    // Lowercased wallet addresses exempt from the switch above.
    creationAllowlist: { type: [String], default: [] },
  },
  { timestamps: true }
);

export type PlatformSettingsDoc = InferSchemaType<typeof PlatformSettingsSchema>;
export const PlatformSettings = models.PlatformSettings || model("PlatformSettings", PlatformSettingsSchema);
