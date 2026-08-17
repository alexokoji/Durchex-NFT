import { Schema, model, models, InferSchemaType } from "mongoose";

const ActivitySchema = new Schema(
  {
    type: {
      type: String,
      enum: ["mint", "list", "sale", "transfer", "bid", "offer", "cancel"],
      required: true,
    },
    item: { type: Schema.Types.ObjectId, ref: "Item", required: true, index: true },
    from: { type: Schema.Types.ObjectId, ref: "User" },
    to: { type: Schema.Types.ObjectId, ref: "User" },
    priceEth: { type: Number, default: null },
    // ERC-1155 only: how many units this activity covers (721 sales are
    // always 1 unit, so this stays null there).
    quantity: { type: Number, default: null },
    txHash: { type: String, default: null },
  },
  { timestamps: true }
);

export type ActivityDoc = InferSchemaType<typeof ActivitySchema>;
export const Activity = models.Activity || model("Activity", ActivitySchema);
