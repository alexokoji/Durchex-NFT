import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { connectDB } from "@/lib/db";
import { verifyAndSyncPurchase } from "@/lib/web3/verifyPurchase";
import { verifyAndSyncOfferFill } from "@/lib/web3/verifyOfferFill";
import { reconcileOffers } from "@/lib/web3/reconcileOffers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reacts to on-chain activity the moment it happens.
 *
 * A schedule cannot do what is wanted here. GitHub's shortest interval is
 * five minutes and Cloudflare's is one; nothing polls every few seconds,
 * and polling that hard would burn RPC quota re-reading blocks where
 * nothing happened. The answer is to stop asking and be told: Alchemy
 * calls this within seconds of a matching transaction being mined, and
 * only when there is one.
 *
 * The scheduled reconciler stays as the backstop, for the times a webhook
 * is dropped or this endpoint is down. Push for latency, poll for
 * certainty — neither alone is enough.
 *
 * Everything here is idempotent and keyed on transaction hash, so a
 * webhook that arrives twice, or arrives after the cron already repaired
 * the same transaction, does nothing the second time.
 */
type AlchemyEvent = {
  event?: {
    data?: {
      block?: {
        logs?: { transaction?: { hash?: string } }[];
      };
    };
    activity?: { hash?: string }[];
  };
};

/**
 * Alchemy signs the raw body with the webhook's own signing key. Verified
 * before anything is read: this endpoint triggers chain reads and database
 * writes, so an unauthenticated caller could otherwise use it to make us
 * do arbitrary work.
 */
function signatureValid(rawBody: string, header: string | null): boolean {
  const key = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY;
  if (!key || !header) return false;
  const expected = createHmac("sha256", key).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(header, "utf8");
  // Length check first — timingSafeEqual throws on a mismatch rather than
  // returning false.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!signatureValid(raw, req.headers.get("x-alchemy-signature"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload: AlchemyEvent;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const chainId = Number(process.env.ALCHEMY_WEBHOOK_CHAIN_ID ?? 1);

  // Both webhook shapes carry transaction hashes; take whichever is
  // present rather than requiring one kind to be configured.
  const hashes = [
    ...(payload.event?.data?.block?.logs ?? []).map((l) => l.transaction?.hash),
    ...(payload.event?.activity ?? []).map((a) => a.hash),
  ].filter((h): h is string => typeof h === "string" && h.startsWith("0x"));

  const unique = [...new Set(hashes.map((h) => h.toLowerCase()))];
  if (unique.length === 0) return NextResponse.json({ handled: 0 });

  await connectDB();

  const handled: string[] = [];
  for (const txHash of unique) {
    // Which kind of settlement this was isn't known from the hash alone,
    // so both verifiers are offered it. Each one checks the receipt itself
    // and declines a transaction that isn't its concern, so trying both is
    // cheap and cannot mis-attribute anything.
    const purchase = await verifyAndSyncPurchase({
      txHash: txHash as `0x${string}`,
      chainId,
      // The buyer is read from the event; there is no client claim here to
      // check it against.
      expectedBuyer: null,
    }).catch(() => ({ ok: false as const }));
    if (purchase.ok) {
      handled.push(txHash);
      continue;
    }
    const fill = await verifyAndSyncOfferFill({
      txHash: txHash as `0x${string}`,
      chainId,
      expectedSeller: null,
    }).catch(() => ({ ok: false as const }));
    if (fill.ok) handled.push(txHash);
  }

  // A funded offer emits OfferMade rather than a fill, and there is no
  // receipt-level handler for it — the reconciler is what turns it into a
  // row, and against a warm watermark it is a cheap call.
  const offers = await reconcileOffers({ chainId, lookbackBlocks: BigInt(200) }).catch(() => null);

  return NextResponse.json({
    handled: handled.length,
    offersRecovered: offers && !("error" in offers) ? offers.recovered.length : 0,
  });
}
