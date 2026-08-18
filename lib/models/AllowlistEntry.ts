import { Schema, model, models, Types, InferSchemaType } from "mongoose";

export const ALLOWLIST_PHASES = ["gtd", "fcfs"] as const;
export type AllowlistPhase = (typeof ALLOWLIST_PHASES)[number];

export const ALLOWLIST_PHASE_LABELS: Record<AllowlistPhase, string> = {
  gtd: "GTD",
  fcfs: "FCFS",
};

export const ALLOWLIST_PHASE_BLURBS: Record<AllowlistPhase, string> = {
  gtd: "Guaranteed — your spot is reserved for the whole GTD window.",
  fcfs: "First come, first served — the allocation is shared, so mint early.",
};

/**
 * A platform-wide allowlist entry, uploaded by an admin as CSV and checked
 * by wallets on /wallet-checker. Separate from a collection's own
 * `mintPhases.allowlist` (see lib/mintPhases.ts): that one gates minting a
 * specific collection on-chain, this one is the marketing-side "am I on the
 * list" lookup that spans the whole platform.
 */
const AllowlistEntrySchema = new Schema(
  {
    phase: { type: String, enum: ALLOWLIST_PHASES, required: true, index: true },
    address: { type: String, required: true, lowercase: true },
    // Optional second CSV column — a handle, tier or note the team wants to
    // show back to the wallet owner. Empty when the CSV is addresses only.
    label: { type: String, default: "" },
  },
  { timestamps: true }
);

// One row per wallet per phase — re-uploading the same CSV updates rather
// than duplicating, so "append" mode is safe to run repeatedly.
AllowlistEntrySchema.index({ phase: 1, address: 1 }, { unique: true });

export type AllowlistEntryDoc = InferSchemaType<typeof AllowlistEntrySchema> & { _id: Types.ObjectId };
export const AllowlistEntry = models.AllowlistEntry || model("AllowlistEntry", AllowlistEntrySchema);
