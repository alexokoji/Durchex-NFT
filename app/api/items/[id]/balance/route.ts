import { NextRequest, NextResponse } from "next/server";
import { parseAbi } from "viem";
import { connectDB } from "@/lib/db";
import { Item } from "@/lib/models/Item";
import { ItemBalance } from "@/lib/models/ItemBalance";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { rpcClient } from "@/lib/web3/reconcile";

const ERC1155_BALANCE_ABI = parseAbi([
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

/**
 * How many units of this ERC-1155 the signed-in wallet holds.
 *
 * Read from the contract, not from our own table. The table is a mirror
 * kept up to date by write-backs that can fail, and this figure decides
 * whether the "list for sale" form appears at all — so a holder whose
 * purchase we failed to record was shown no form and had no way to sell
 * something they demonstrably owned. The chain cannot be wrong about who
 * holds what.
 *
 * The stored balance is corrected when it disagrees, which quietly repairs
 * the profile holdings and offer-accept checks that read from it, without
 * waiting for the reconciler to come round.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ quantity: 0 });
  const { id } = await context.params;

  await connectDB();
  const stored = await ItemBalance.findOne({ item: id, owner: user._id }).lean();
  const fallback = stored?.quantity ?? 0;

  const item = await Item.findById(id)
    .select("tokenId standard collection")
    .populate("collection", "contractAddress chainId")
    .lean();
  const collection = item?.collection as { contractAddress?: string; chainId?: number } | null;

  if (item?.standard !== "ERC1155" || !item?.tokenId || !collection?.contractAddress) {
    return NextResponse.json({ quantity: fallback });
  }

  const client = rpcClient(collection.chainId ?? 1);
  if (!client) return NextResponse.json({ quantity: fallback });

  try {
    const onChain = Number(
      (await client.readContract({
        address: collection.contractAddress as `0x${string}`,
        abi: ERC1155_BALANCE_ABI,
        functionName: "balanceOf",
        args: [user.address as `0x${string}`, BigInt(String(item.tokenId))],
      })) as bigint
    );

    if (onChain !== fallback) {
      await ItemBalance.findOneAndUpdate(
        { item: id, owner: user._id },
        { quantity: onChain },
        { upsert: true }
      );
    }
    return NextResponse.json({ quantity: onChain, source: "chain" });
  } catch {
    // An unreachable RPC is not evidence the wallet holds nothing, so the
    // stored figure stands rather than hiding the form.
    return NextResponse.json({ quantity: fallback, source: "stored" });
  }
}
