import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { verifyAndSyncOfferFill } from "@/lib/web3/verifyOfferFill";

// Called by the seller's browser once their acceptCollectionOffer
// transaction mines. Safe because the server re-reads the receipt from
// chain itself — see verifyAndSyncOfferFill.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const txHash = String(body.txHash ?? "");
  const chainId = Math.floor(Number(body.chainId));
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "Invalid transaction hash" }, { status: 400 });
  }

  await connectDB();
  const result = await verifyAndSyncOfferFill({
    txHash: txHash as `0x${string}`,
    chainId,
    expectedSeller: user.address,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
