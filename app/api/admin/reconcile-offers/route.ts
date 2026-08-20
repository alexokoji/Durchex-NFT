import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import { reconcileOffers } from "@/lib/web3/reconcileOffers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Writes back any escrowed offer the site failed to record.
 *
 * A buyer whose ETH is locked in the contract with no offer to show for it
 * is the worst state this system can reach, and it is reachable through no
 * fault of theirs — the deposit and the database write are separate steps.
 * See lib/web3/reconcileOffers.ts.
 */
export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const chainId = Number(body.chainId ?? 1);

  await connectDB();
  try {
    const result = await reconcileOffers({ chainId });
    if ("error" in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Offer scan failed" },
      { status: 502 }
    );
  }
}
