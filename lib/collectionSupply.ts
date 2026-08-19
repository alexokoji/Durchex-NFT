import { Types } from "mongoose";
import { Item } from "@/lib/models/Item";

export type MintProgress = {
  /** Units actually on-chain, across both standards. */
  mintedUnits: number;
  /** Units that exist to be minted at all — the sum of every item's supply. */
  totalUnits: number;
};

/**
 * Mint progress for a collection, counted in units rather than item rows.
 *
 * The distinction matters entirely for ERC-1155: one Item document is an
 * edition of many units, and its `isMinted` flag flips on the *first*
 * purchase. Counting documents therefore reported an edition with 1 of 300
 * sold as fully minted, which is how the secondary market opened on
 * collections that had barely started minting.
 *
 * ERC-721 items are one unit each, so they contribute 1/1.
 */
export async function collectionMintProgress(
  collectionId: Types.ObjectId | string
): Promise<MintProgress> {
  const [row] = await Item.aggregate([
    { $match: { collection: new Types.ObjectId(String(collectionId)) } },
    {
      $group: {
        _id: null,
        mintedUnits: {
          $sum: {
            $cond: [
              { $eq: ["$standard", "ERC1155"] },
              { $ifNull: ["$mintedSupply", 0] },
              { $cond: ["$isMinted", 1, 0] },
            ],
          },
        },
        totalUnits: {
          $sum: {
            $cond: [
              { $eq: ["$standard", "ERC1155"] },
              // A 1155 with no declared supply is open-ended; the units it
              // has already minted are the only ones we can be sure of.
              { $max: [{ $ifNull: ["$totalSupply", 0] }, { $ifNull: ["$mintedSupply", 0] }] },
              1,
            ],
          },
        },
      },
    },
  ]);
  return { mintedUnits: row?.mintedUnits ?? 0, totalUnits: row?.totalUnits ?? 0 };
}
