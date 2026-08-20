import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CHAINS, getWatermark, reconcileRange, rpcClient, setWatermark } from "@/lib/web3/reconcile";
import { reconcileOffers } from "@/lib/web3/reconcileOffers";
import {
  closeSpentEscrowOffers,
  expireLegacyOffers,
  recomputeStats,
  repairListingFills,
} from "@/lib/recomputeStats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Every repair pass, in one authenticated call.
 *
 * The pattern behind all of these is the same: an action settles on-chain
 * and a browser is then expected to report it back. That report can always
 * fail — a closed tab, a dropped request, a cold function — and each time
 * it has, someone has had to ask for a manual fix. Sales, offers, offer
 * fills, listing fill counts and the totals derived from them have each
 * gone missing that way.
 *
 * Run on a schedule, this makes the chain the thing that decides, and the
 * database catch up on its own.
 *
 * Steps are independent: one failing must not stop the others, because the
 * one that fails is rarely the one that matters today. Each reports its own
 * outcome instead.
 */
const FIRST_RUN_LOOKBACK = BigInt(14400);

async function step<T>(name: string, run: () => Promise<T>) {
  try {
    return { name, ok: true as const, result: await run() };
  } catch (err) {
    return { name, ok: false as const, error: err instanceof Error ? err.message : "failed" };
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const chainId = Number(new URL(req.url).searchParams.get("chainId") ?? 1);
  if (!CHAINS[chainId]) return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });

  await connectDB();
  const client = rpcClient(chainId);
  if (!client) return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });

  const steps = [];

  // Sales first: everything downstream is derived from them.
  steps.push(
    await step("sales", async () => {
      const stored = await getWatermark(chainId);
      let fromBlock = stored;
      if (fromBlock === null) {
        const head = await client.getBlockNumber();
        fromBlock = head > FIRST_RUN_LOOKBACK ? head - FIRST_RUN_LOOKBACK : BigInt(0);
      }
      const result = await reconcileRange({ chainId, fromBlock });
      if ("error" in result) throw new Error(result.error);
      await setWatermark(chainId, BigInt(result.toBlock));
      return { repaired: result.repaired.length, failed: result.failed.length, to: result.toBlock };
    })
  );

  steps.push(
    await step("offers", async () => {
      const result = await reconcileOffers({ chainId });
      if ("error" in result) throw new Error(result.error);
      return {
        recovered: result.recovered.length,
        fillsRepaired: result.fillsRepaired.length,
        fillsFailed: result.fillsFailed.length,
      };
    })
  );

  steps.push(await step("legacyOffers", () => expireLegacyOffers()));
  steps.push(await step("spentOffers", () => closeSpentEscrowOffers(chainId)));
  steps.push(await step("listingFills", () => repairListingFills(chainId)));

  // Totals last: they are a function of everything above, so recomputing
  // before the repairs land would just bake in the old numbers.
  steps.push(
    await step("stats", async () => {
      const result = await recomputeStats();
      return { collections: result.collections, itemsWithLastSale: result.itemsWithLastSale };
    })
  );

  return NextResponse.json({
    chainId,
    ranAt: new Date().toISOString(),
    ok: steps.every((s) => s.ok),
    steps,
  });
}
