import { Schema, model, models, Types, InferSchemaType } from "mongoose";

// Per-wallet quantity ownership for ERC-1155 items — an ERC-721 item has
// exactly one owner (Item.owner), but an ERC-1155 token can be split across
// many simultaneous holders, so ownership can't live as a single field on
// Item the way it does for 721.
const ItemBalanceSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: "Item", required: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    quantity: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

ItemBalanceSchema.index({ item: 1, owner: 1 }, { unique: true });

export type ItemBalanceDoc = InferSchemaType<typeof ItemBalanceSchema> & { _id: Types.ObjectId };
export const ItemBalance = models.ItemBalance || model("ItemBalance", ItemBalanceSchema);
