import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { PhaseClaim } from "@/lib/models/PhaseClaim";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { PHASE_KEYS, PhaseKey, RACES_ALLOCATION, isPhaseLive } from "@/lib/mintPhases";

// Records a mint against a phase's per-wallet cap and (for FCFS phases)
// its shared allocation. This is the off-chain enforcement layer for
// collections that mint through the shared lazy-mint contracts rather than
// a dedicated per-collection drop contract — toggling/scheduling a phase in
// the PATCH route above is what actually gates access; this endpoint is
// what stops a phase from being over-claimed while it's live.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string; phase: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id, phase } = await context.params;
  if (!PHASE_KEYS.includes(phase as PhaseKey)) {
    return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
  }
  const key = phase as PhaseKey;
  const racesAllocation = RACES_ALLOCATION[key];
  const quantity = Math.max(1, Math.floor(Number((await req.json().catch(() => ({}))).quantity ?? 1)));

  await connectDB();
  const collection = await Collection.findById(id).select(`mintPhases.${key}`);
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  const config = collection.mintPhases[key];
  if (!isPhaseLive(config)) {
    return NextResponse.json({ error: "This phase isn't open right now" }, { status: 403 });
  }
  if (key !== "public" && !config.allowlist.includes(user.address)) {
    return NextResponse.json({ error: "Your wallet isn't on the allowlist for this phase" }, { status: 403 });
  }

  const existingClaim = await PhaseClaim.findOne({ collection: id, phase: key, wallet: user.address }).lean();
  const alreadyClaimed = existingClaim?.count ?? 0;
  if (config.walletLimit > 0 && alreadyClaimed + quantity > config.walletLimit) {
    return NextResponse.json(
      { error: `This wallet can mint at most ${config.walletLimit} in this phase (already claimed ${alreadyClaimed}).` },
      { status: 409 }
    );
  }
  // GTD (whitelist) doesn't race the shared allocation — every allowlisted
  // wallet is guaranteed its walletLimit any time the phase is live.
  if (racesAllocation && config.allocation > 0 && config.minted + quantity > config.allocation) {
    return NextResponse.json({ error: "This phase is sold out" }, { status: 409 });
  }

  // Increment atomically first — the $lte guard is what actually prevents
  // overselling under concurrency, verified under real concurrent load.
  const updated = await Collection.findOneAndUpdate(
    {
      _id: id,
      [`mintPhases.${key}.enabled`]: true,
      ...(racesAllocation && config.allocation > 0
        ? { [`mintPhases.${key}.minted`]: { $lte: config.allocation - quantity } }
        : {}),
    },
    { $inc: { [`mintPhases.${key}.minted`]: quantity } },
    { new: true }
  ).select(`mintPhases.${key}`);
  if (!updated) {
    return NextResponse.json({ error: "This phase is sold out" }, { status: 409 });
  }

  // Decide sellout from the POST-increment value, not a pre-read snapshot —
  // under real concurrency, every request in a simultaneous burst reads the
  // same stale "not sold out yet" snapshot before any of the increments
  // land, so a decision made from that snapshot never fires even once the
  // phase is genuinely exhausted. MongoDB's $inc is atomic regardless of
  // app-level concurrency, so `updated.minted` here is the true, current
  // cumulative total — safe to decide from.
  const finalMinted = updated.mintPhases[key].minted;
  const allocation = updated.mintPhases[key].allocation;
  const sellsOut = racesAllocation && allocation > 0 && finalMinted >= allocation;
  console.log(
    "[claim-debug]",
    JSON.stringify({
      key,
      racesAllocation,
      finalMinted,
      allocation,
      finalMintedType: typeof finalMinted,
      allocationType: typeof allocation,
      comparison: finalMinted >= allocation,
      sellsOut,
    })
  );
  if (sellsOut) {
    await Collection.updateOne(
      { _id: id, [`mintPhases.${key}.enabled`]: true },
      { $set: { [`mintPhases.${key}.enabled`]: false } }
    );
  }

  await PhaseClaim.findOneAndUpdate(
    { collection: id, phase: key, wallet: user.address },
    { $inc: { count: quantity } },
    { upsert: true }
  );

  return NextResponse.json({
    claimed: alreadyClaimed + quantity,
    minted: finalMinted,
    allocation,
    soldOut: sellsOut,
  });
}
