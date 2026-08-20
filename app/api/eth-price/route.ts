import { NextResponse } from "next/server";
import { alchemyKey } from "@/lib/web3/alchemy";

export const dynamic = "force-dynamic";

/**
 * The live ETH/USD rate, for showing prices in dollars.
 *
 * Every USD figure on the site was computed from a hardcoded 3400. The
 * real rate at the time of writing was 2268, so each of those numbers
 * overstated the price by half — worse than showing no dollar figure at
 * all, because it looks authoritative.
 *
 * Fetched server-side so the key stays private and one upstream call
 * serves every visitor. On total failure this returns no rate rather than
 * a guess, and the UI keeps showing ETH.
 */
let cached: { usd: number; at: number } | null = null;
const TTL_MS = 60_000;

async function fromAlchemy(): Promise<number | null> {
  const key = alchemyKey();
  if (!key) return null;
  try {
    const res = await fetch(`https://api.g.alchemy.com/prices/v1/${key}/tokens/by-symbol?symbols=ETH`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { prices?: { currency?: string; value?: string }[] }[];
    };
    const value = data.data?.[0]?.prices?.find((p) => p.currency?.toLowerCase() === "usd")?.value;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function fromCoinbase(): Promise<number | null> {
  try {
    const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { amount?: string } };
    const n = Number(data.data?.amount);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function GET() {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ usd: cached.usd, cached: true });
  }

  const usd = (await fromAlchemy()) ?? (await fromCoinbase());
  if (usd === null) {
    // A slightly stale rate beats none — but only if we ever had one.
    if (cached) return NextResponse.json({ usd: cached.usd, stale: true });
    return NextResponse.json({ usd: null });
  }

  cached = { usd, at: Date.now() };
  return NextResponse.json({ usd });
}
