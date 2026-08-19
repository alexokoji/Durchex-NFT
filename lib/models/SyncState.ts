import { Schema, model, models, InferSchemaType } from "mongoose";

// How far the chain reconciler has actually scanned, per chain.
//
// The reconciler used to scan a fixed window back from the head of the
// chain. That silently loses data whenever a run is skipped or fails for
// longer than the window — and on Vercel's Hobby plan the cron only fires
// once a day, so one bad run was enough to leave a permanent hole. Storing
// a watermark makes a missed run catch up on the next one instead.
const SyncStateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    // Stored as a string: block numbers are BigInt on-chain and will
    // outgrow the exact-integer range a JS number can hold.
    blockNumber: { type: String, required: true },
  },
  { timestamps: true }
);

export type SyncStateDoc = InferSchemaType<typeof SyncStateSchema>;
export const SyncState = models.SyncState || model("SyncState", SyncStateSchema);

export function reconcileKey(chainId: number) {
  return `reconcile-sales:${chainId}`;
}
