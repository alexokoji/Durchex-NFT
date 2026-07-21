import { Schema, model, models } from "mongoose";

const FavoriteSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    item: { type: Schema.Types.ObjectId, ref: "Item", required: true },
  },
  { timestamps: true }
);

FavoriteSchema.index({ user: 1, item: 1 }, { unique: true });

export const Favorite = models.Favorite || model("Favorite", FavoriteSchema);
