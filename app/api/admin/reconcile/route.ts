import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { CHAINS, earliestBlock, getWatermark, reconcileRange, rpcClient, setWatermark } from "@/lib/web3/reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin-triggered chain backfill.
 *
 * The nightly cron only moves forward from its watermark, which does
 * nothing for purchases that were lost before any of this existed — and
 * those are exactly the ones leaving holders with an empty profile. This
 * walks a range on demand instead.
 *
 * A full history is far more blocks than one serverless invocation can
 * scan, so each call does a bounded slice and returns `nextBlock`. The
 * panel calls it in a loop until that comes back null; re-running any
 * slice is harmless.
 */
export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const chainId = Number(body.chainId ?? 1);
  if (!CHAINS[chainId]) return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });

  await connectDB();
  const client = rpcClient(chainId);
  if (!client) return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });

  const head = await client.getBlockNumber();
  let fromBlock: bigint;
  if (body.fromBlock !== undefined && body.fromBlock !== null && body.fromBlock !== "") {
    try {
      fromBlock = BigInt(String(body.fromBlock));
    } catch {
      return NextResponse.json({ error: "fromBlock must be a whole number" }, { status: 400 });
    }
    if (fromBlock < BigInt(0) || fromBlock > head) {
      return NextResponse.json({ error: `fromBlock must be between 0 and ${head}` }, { status: 400 });
    }
  } else {
    // No explicit start: continue from wherever the reconciler last got to.
    fromBlock = (await getWatermark(chainId)) ?? earliestBlock(chainId);
  }

  // A throw here (RPC refusing a range, a provider rate limit, a network
  // blip) would otherwise surface as an empty 500 with the reason only in
  // the platform logs — useless to whoever is running the backfill.
  let result;
  try {
    result = await reconcileRange({ chainId, fromBlock });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed", fromBlock: String(fromBlock) },
      { status: 502 }
    );
  }
  if ("error" in result) return NextResponse.json(result, { status: 400 });

  // A backfill can legitimately run behind the nightly watermark, and
  // dragging it backwards would make the cron rescan ground it has already
  // covered. Only ever advance it.
  const current = await getWatermark(chainId);
  const scanned = BigInt(result.toBlock);
  if (current === null || scanned > current) await setWatermark(chainId, scanned);

  return NextResponse.json({ ...result, head: String(head) });
}
