import { Schema, model, models } from "mongoose";

const NotificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["offer", "bid", "outbid", "offer_accepted", "sale", "follow"],
      required: true,
    },
    item: { type: Schema.Types.ObjectId, ref: "Item" },
    fromUser: { type: Schema.Types.ObjectId, ref: "User" },
    amountEth: { type: Number, default: null },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const Notification = models.Notification || model("Notification", NotificationSchema);
