import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { verifyAndSyncPurchase } from "@/lib/web3/verifyPurchase";

// Called by the buyer's own browser right after a purchase transaction
// mines, so the app reflects real ownership without needing a continuously
// running indexer process. Safe because the server re-verifies the
// transaction on-chain itself — see verifyAndSyncPurchase.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const txHash = String(body.txHash ?? "");
  const chainId = Math.floor(Number(body.chainId));
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "Invalid transaction hash" }, { status: 400 });
  }
  // Purely descriptive — how the buyer reached this purchase. The money
  // movement is still verified from the on-chain receipt, so a wrong value
  // here can only mislabel history, never affect settlement.
  const SALE_TYPES = ["BUY_NOW", "BUY_FLOOR", "NFT_OFFER", "COLLECTION_OFFER", "AUCTION"] as const;
  const saleType = SALE_TYPES.includes(body.saleType) ? body.saleType : "BUY_NOW";

  await connectDB();
  const result = await verifyAndSyncPurchase({
    txHash: txHash as `0x${string}`,
    chainId,
    expectedBuyer: user.address,
    saleType,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
