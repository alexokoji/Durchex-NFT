import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";
import {
  closeSpentEscrowOffers,
  expireLegacyOffers,
  recomputeStats,
  repairListingFills,
} from "@/lib/recomputeStats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rebuilds derived marketplace figures, and retires offers that can no
 * longer be filled.
 *
 * Both are cleanup after the fact: running totals drift whenever a sale's
 * write-back fails, and offers made before ETH escrow are unacceptable by
 * construction while still counting as the top offer. See
 * lib/recomputeStats.ts.
 */
export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ error: "Administrator access is required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const chainId = Number(body.chainId ?? 1);

  await connectDB();
  try {
    const expired = await expireLegacyOffers();
    const spent = await closeSpentEscrowOffers(chainId);
    // Listing fills first: the floor recomputed below depends on which
    // listings still have units left.
    const listings = await repairListingFills(chainId);
    const stats = await recomputeStats();
    return NextResponse.json({ expired, spent, listings, ...stats });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Recompute failed" },
      { status: 500 }
    );
  }
}
