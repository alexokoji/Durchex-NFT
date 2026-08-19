import { Types } from "mongoose";
import { Item } from "@/lib/models/Item";
import { readMintedSupplies } from "@/lib/web3/onChainSupply";

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
  // Editions get their minted count from the contract wherever possible —
  // see lib/web3/onChainSupply.ts. Without this the collection gate is
  // built on the same drifting numbers the item page was.
  const editions = await Item.find({ collection: collectionId, standard: "ERC1155" })
    .select("tokenId mintedSupply totalSupply")
    .populate("collection", "contractAddress chainId")
    .lean();
  const chainCounts = await readMintedSupplies(
    editions.map((e) => ({
      id: String(e._id),
      contractAddress: (e.collection as { contractAddress?: string })?.contractAddress ?? "",
      chainId: (e.collection as { chainId?: number })?.chainId ?? 1,
      tokenId: e.tokenId ? String(e.tokenId) : null,
    }))
  );
  if (chainCounts.size > 0) {
    await Promise.all(
      editions
        .filter((e) => {
          const v = chainCounts.get(String(e._id));
          return v !== undefined && v !== (e.mintedSupply ?? 0);
        })
        .map((e) =>
          // Written back so the next read is right even if the RPC is
          // unavailable then, and so anything querying Item directly sees
          // the corrected figure too.
          Item.updateOne({ _id: e._id }, { mintedSupply: chainCounts.get(String(e._id)) })
        )
    );
  }

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
