import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { Activity } from "@/lib/models/Activity";
import { Item } from "@/lib/models/Item";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reconstructs each item's last sale price from the sale history we
 * already hold.
 *
 * Every sale was recorded in Activity all along; only the ERC-721 handlers
 * also copied the price onto the item, so editions showed no last sale
 * however much they traded. Fixing the handlers only helps future sales,
 * and the past is sitting right there in Activity — so this replays it.
 *
 * Prices are stored per unit, matching what the handlers now write: an
 * Activity row for an edition records the lot total and how many units it
 * covered, and a lot total would not be comparable with a listing price.
 */
export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  await connectDB();

  // Newest sale per item. Sorting before grouping is what makes $first the
  // most recent one rather than an arbitrary row.
  const latest = await Activity.aggregate([
    { $match: { type: "sale", priceEth: { $gt: 0 } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$item",
        priceEth: { $first: "$priceEth" },
        quantity: { $first: "$quantity" },
        at: { $first: "$createdAt" },
      },
    },
  ]);

  let updated = 0;
  let unchanged = 0;
  for (const row of latest) {
    const qty = Number(row.quantity ?? 1) || 1;
    const perUnit = row.priceEth / qty;
    const result = await Item.updateOne(
      { _id: row._id, lastSalePriceEth: { $ne: perUnit } },
      { lastSalePriceEth: perUnit }
    );
    if (result.modifiedCount > 0) updated += 1;
    else unchanged += 1;
  }

  return NextResponse.json({ itemsWithSales: latest.length, updated, unchanged });
}
