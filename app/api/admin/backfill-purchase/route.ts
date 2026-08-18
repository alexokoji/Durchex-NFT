import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { verifyAndSyncPurchase } from "@/lib/web3/verifyPurchase";

/**
 * Temporary, secret-gated replay of a sale the app missed.
 *
 * Purchases are normally confirmed by the buyer's own browser, which for a
 * while could hang before ever making that call — leaving mints that were
 * paid for and settled on-chain with no record in the app at all. This
 * re-runs the same verification for a given transaction.
 *
 * It takes only a transaction hash: everything else (who bought, what, for
 * how much) is read back from the chain by verifyAndSyncPurchase, so this
 * cannot be used to fabricate ownership — the worst a caller can do is ask
 * the server to re-check a real transaction.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-backfill-secret");
  if (!secret || secret !== process.env.BACKFILL_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const txHash = String(body.txHash ?? "");
  const chainId = Math.floor(Number(body.chainId));
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "Invalid transaction hash" }, { status: 400 });
  }

  await connectDB();
  // The buyer is whoever the on-chain event says it is — unlike the normal
  // confirm route there's no session to match against, which is exactly
  // what makes this usable for someone else's missed purchase.
  const result = await verifyAndSyncPurchase({
    txHash: txHash as `0x${string}`,
    chainId,
    expectedBuyer: null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
