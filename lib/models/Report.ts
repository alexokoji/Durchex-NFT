import { Schema, model, models, InferSchemaType } from "mongoose";

const ReportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetType: { type: String, enum: ["item", "collection", "user"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    reason: {
      type: String,
      enum: ["copyright", "counterfeit", "explicit", "spam", "harassment", "other"],
      required: true,
    },
    details: { type: String, default: "", maxlength: 1200 },
    status: { type: String, enum: ["open", "reviewing", "resolved", "dismissed"], default: "open", index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    resolutionNote: { type: String, default: "", maxlength: 1200 },
  },
  { timestamps: true }
);

ReportSchema.index({ reporter: 1, targetType: 1, targetId: 1, status: 1 });

export type ReportDoc = InferSchemaType<typeof ReportSchema>;
export const Report = models.Report || model("Report", ReportSchema);
