import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Item } from "@/lib/models/Item";

/**
 * Distinct traits across a collection's *minted* items, with how many
 * items carry each value.
 *
 * Only minted items count, because a collection offer's eligible set is a
 * merkle tree of token ids — an unminted item has no token id and so
 * cannot be committed to or proven. Surfacing counts here means a buyer
 * narrowing an offer by trait can see exactly how many NFTs they'd be
 * exposing themselves to before they sign.
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid collection" }, { status: 400 });

  await connectDB();
  const rows = await Item.aggregate([
    { $match: { collection: new Types.ObjectId(id), tokenId: { $ne: null } } },
    { $unwind: "$traits" },
    {
      $group: {
        _id: { traitType: "$traits.trait_type", value: "$traits.value" },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: "$_id.traitType",
        values: { $push: { value: "$_id.value", count: "$count" } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return NextResponse.json({
    traits: rows
      .filter((r) => r._id)
      .map((r) => ({
        traitType: r._id as string,
        values: (r.values as { value: string; count: number }[])
          .filter((v) => v.value)
          .sort((a, b) => b.count - a.count),
      })),
  });
}
