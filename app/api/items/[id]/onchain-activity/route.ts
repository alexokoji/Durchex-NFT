import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Item } from "@/lib/models/Item";
import { User } from "@/lib/models/User";
import { alchemyAvailable, getTokenTransfers } from "@/lib/web3/alchemy";

export const dynamic = "force-dynamic";

/**
 * A token's real transfer history, read from the chain rather than from
 * our own activity records.
 *
 * Our Activity table only ever contains what happened through Durchex, so
 * a token that was traded elsewhere — or minted before we knew about it —
 * shows an empty history that is simply untrue. This asks the chain
 * instead, and works for any contract.
 *
 * Addresses are resolved to Durchex usernames where we know them, and left
 * as addresses where we don't; a wallet being unknown to us is not a
 * reason to hide that the transfer happened.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid item" }, { status: 400 });

  await connectDB();
  const item = await Item.findById(id)
    .select("tokenId collection")
    .populate("collection", "contractAddress chainId")
    .lean();
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const collection = item.collection as { contractAddress?: string; chainId?: number } | null;
  const contractAddress = collection?.contractAddress;
  const chainId = collection?.chainId ?? 1;
  if (!contractAddress) return NextResponse.json({ transfers: [] });
  if (!alchemyAvailable(chainId)) return NextResponse.json({ transfers: [], unavailable: true });

  let transfers;
  try {
    transfers = await getTokenTransfers({
      contractAddress,
      tokenId: item.tokenId ? String(item.tokenId) : null,
      chainId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't read chain activity" },
      { status: 502 }
    );
  }

  const addresses = [...new Set(transfers.flatMap((t) => [t.from, t.to]).filter(Boolean))].map((a) =>
    a.toLowerCase()
  );
  const users = addresses.length
    ? await User.find({ address: { $in: addresses } }).select("address username verificationTier avatarUrl").lean()
    : [];
  const byAddress = new Map(users.map((u) => [u.address.toLowerCase(), u]));

  const label = (address: string) => {
    const user = byAddress.get(address?.toLowerCase());
    return {
      address,
      username: user?.username ?? null,
      verificationTier: user?.verificationTier ?? "none",
      avatarUrl: user?.avatarUrl ?? null,
    };
  };

  return NextResponse.json({
    chainId,
    contractAddress,
    transfers: transfers.map((t) => ({
      txHash: t.txHash,
      type: t.type,
      quantity: t.quantity,
      timestamp: t.timestamp,
      from: label(t.from),
      to: label(t.to),
    })),
  });
}
