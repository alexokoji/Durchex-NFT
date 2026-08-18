import { Activity } from "@/lib/models/Activity";
import { Types } from "mongoose";

export type SaleType = "BUY_NOW" | "BUY_FLOOR" | "NFT_OFFER" | "COLLECTION_OFFER" | "AUCTION";

export async function recordActivity(params: {
  type: "mint" | "list" | "sale" | "transfer" | "bid" | "offer" | "cancel";
  item: string | Types.ObjectId;
  from?: string | Types.ObjectId | null;
  to?: string | Types.ObjectId | null;
  priceEth?: number | null;
  quantity?: number | null;
  saleType?: SaleType | null;
  txHash?: string | null;
}) {
  return Activity.create({
    type: params.type,
    item: params.item,
    from: params.from ?? undefined,
    to: params.to ?? undefined,
    priceEth: params.priceEth ?? null,
    quantity: params.quantity ?? null,
    saleType: params.saleType ?? null,
    txHash: params.txHash ?? null,
  });
}
