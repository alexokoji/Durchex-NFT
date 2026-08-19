import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Item } from "@/lib/models/Item";
import { ItemBalance } from "@/lib/models/ItemBalance";
import { getCurrentUser } from "@/lib/auth/currentUser";

export const dynamic = "force-dynamic";

/**
 * What the signed-in wallet holds in this collection, so the collection
 * header can offer "Sell" without the holder having to remember which of
 * their items to open.
 *
 * Both ownership models: an ERC-721 is owned outright on the Item, an
 * ERC-1155 is a balance. Only minted holdings count — an unminted item is
 * the creator's to sell through the primary mint, not a resale.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ holdings: [] });
  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ holdings: [] });

  await connectDB();
  const collectionId = new Types.ObjectId(id);

  const [owned721, balances] = await Promise.all([
    Item.find({
      collection: collectionId,
      owner: user._id,
      isMinted: true,
      standard: { $ne: "ERC1155" },
    })
      .select("name")
      .lean(),
    ItemBalance.find({ owner: user._id, quantity: { $gt: 0 } })
      .select("item quantity")
      .populate({ path: "item", select: "name collection standard" })
      .lean(),
  ]);

  const editions = balances
    .filter((b) => {
      const item = b.item as { collection?: Types.ObjectId } | null;
      return item && String(item.collection) === String(collectionId);
    })
    .map((b) => ({
      id: String((b.item as { _id: Types.ObjectId })._id),
      name: (b.item as { name: string }).name,
      quantity: b.quantity,
    }));

  return NextResponse.json({
    holdings: [
      ...owned721.map((i) => ({ id: String(i._id), name: i.name, quantity: 1 })),
      ...editions,
    ],
  });
}
