import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { nextVoucherNonce } from "@/lib/web3/voucherNonce";

/**
 * The nonce the signed-in creator's next voucher must carry for this
 * collection's contract. Read from the chain rather than a per-user
 * counter — see lib/web3/voucherNonce.ts for why a global counter breaks
 * as soon as more than one chain is live.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid collection" }, { status: 400 });

  await connectDB();
  const collection = await Collection.findById(id).select("contractAddress chainId").lean();
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  try {
    const nonce = await nextVoucherNonce({
      creatorId: user._id,
      creatorAddress: user.address,
      contractAddress: collection.contractAddress,
      chainId: collection.chainId,
    });
    return NextResponse.json({ nonce });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't determine the voucher nonce" },
      { status: 503 }
    );
  }
}
