import { Types } from "mongoose";
import { Notification } from "@/lib/models/Notification";

export async function createNotification(params: {
  user: string | Types.ObjectId;
  type: "offer" | "bid" | "outbid" | "offer_accepted" | "sale" | "follow";
  item?: string | Types.ObjectId | null;
  fromUser?: string | Types.ObjectId | null;
  amountEth?: number | null;
}) {
  // Never notify someone about their own action.
  if (params.fromUser && String(params.fromUser) === String(params.user)) return null;

  return Notification.create({
    user: params.user,
    type: params.type,
    item: params.item ?? undefined,
    fromUser: params.fromUser ?? undefined,
    amountEth: params.amountEth ?? null,
  });
}
