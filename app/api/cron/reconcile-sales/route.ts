import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CHAINS, getWatermark, reconcileRange, rpcClient, setWatermark } from "@/lib/web3/reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nightly catch-up: replays any sale the app never recorded.
 *
 * Resumes from a stored watermark rather than a fixed window back from the
 * head of the chain. The window approach silently lost every sale in any
 * gap longer than the window, and on Vercel's Hobby plan the cron only
 * fires once a day — one failed run was enough to lose a day of purchases
 * permanently. With a watermark a missed run is simply caught up by the
 * next one.
 *
 * See lib/web3/reconcile.ts for why re-running is always safe.
 */

// Only used the very first time, before a watermark exists: roughly two
// days of blocks. A full historical backfill is a deliberate action, run
// from the admin panel, not something a cron should start on its own.
const FIRST_RUN_LOOKBACK = BigInt(14400);

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const chainId = Number(new URL(req.url).searchParams.get("chainId") ?? 1);
  if (!CHAINS[chainId]) return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });

  await connectDB();
  const client = rpcClient(chainId);
  if (!client) return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });

  const stored = await getWatermark(chainId);
  let fromBlock = stored;
  if (fromBlock === null) {
    const head = await client.getBlockNumber();
    fromBlock = head > FIRST_RUN_LOOKBACK ? head - FIRST_RUN_LOOKBACK : BigInt(0);
  }

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

  // Advanced even on a partial scan, so the next run picks up exactly
  // where this one stopped rather than redoing it.
  await setWatermark(chainId, BigInt(result.toBlock));

  return NextResponse.json({ ...result, resumedFrom: stored === null ? "first run" : String(stored) });
}
