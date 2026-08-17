import { Schema, model, models, InferSchemaType } from "mongoose";

const AdminUserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    passwordSalt: { type: String, required: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type AdminUserDoc = InferSchemaType<typeof AdminUserSchema>;
export const AdminUser = models.AdminUser || model("AdminUser", AdminUserSchema);
