import { Schema, model, models } from "mongoose";

const DropNotifySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    collection: { type: Schema.Types.ObjectId, ref: "Collection", required: true },
  },
  { timestamps: true }
);

DropNotifySchema.index({ user: 1, collection: 1 }, { unique: true });

export const DropNotify = models.DropNotify || model("DropNotify", DropNotifySchema);
