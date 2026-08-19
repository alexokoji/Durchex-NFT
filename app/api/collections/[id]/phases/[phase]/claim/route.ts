import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { PhaseClaim } from "@/lib/models/PhaseClaim";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { PHASE_KEYS, PhaseKey, RACES_ALLOCATION, effectivePublicAllocation, isPhaseLive } from "@/lib/mintPhases";

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
  const body = await req.json().catch(() => ({}));
  const quantity = Math.max(1, Math.floor(Number(body.quantity ?? 1)));
  const action = body.action === "release" ? "release" : "reserve";

  await connectDB();

  // Releasing a reservation whose mint never happened (wallet rejected, or
  // the transaction failed). Guarded so it can only ever give back units
  // this wallet actually holds a reservation for — a replayed release must
  // not be able to drive the counters negative and hand out free supply.
  if (action === "release") {
    const released = await PhaseClaim.findOneAndUpdate(
      { collection: id, phase: key, wallet: user.address, count: { $gte: quantity } },
      { $inc: { count: -quantity } },
      { new: true }
    );
    if (!released) {
      return NextResponse.json({ error: "Nothing to release" }, { status: 409 });
    }
    await Collection.updateOne(
      { _id: id, [`mintPhases.${key}.minted`]: { $gte: quantity } },
      { $inc: { [`mintPhases.${key}.minted`]: -quantity } }
    );
    return NextResponse.json({ released: quantity, claimed: released.count });
  }
  const collection = await Collection.findById(id).select(`mintPhases.${key}`);
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  const config = collection.mintPhases[key];
  if (!isPhaseLive(config)) {
    return NextResponse.json({ error: "This phase isn't open right now" }, { status: 403 });
  }
  if (key !== "public" && !config.allowlist.includes(user.address)) {
    return NextResponse.json({ error: "Your wallet isn't on the allowlist for this phase" }, { status: 403 });
  }

  // Reserve this wallet's units atomically. Reading the count and then
  // incrementing separately lets two concurrent mints both pass the check
  // and blow through the cap, so the limit has to live in the update's own
  // filter. The doc is created first so the conditional update below has
  // something to match on a wallet's very first mint.
  await PhaseClaim.updateOne(
    { collection: id, phase: key, wallet: user.address },
    { $setOnInsert: { count: 0 } },
    { upsert: true }
  );
  const reserved = await PhaseClaim.findOneAndUpdate(
    {
      collection: id,
      phase: key,
      wallet: user.address,
      ...(config.walletLimit > 0 ? { count: { $lte: config.walletLimit - quantity } } : {}),
    },
    { $inc: { count: quantity } },
    { new: true }
  );
  if (!reserved) {
    const current = await PhaseClaim.findOne({ collection: id, phase: key, wallet: user.address }).lean();
    return NextResponse.json(
      {
        error: `This wallet can mint at most ${config.walletLimit} in this phase (already claimed ${current?.count ?? 0}).`,
      },
      { status: 409 }
    );
  }
  const alreadyClaimed = reserved.count - quantity;

  // GTD (whitelist) doesn't race the shared allocation — every allowlisted
  // wallet is guaranteed its walletLimit any time the phase is live.
  // Public's cap is derived live, not read from the stored field: supply
  // left unminted by a finished GTD/FCFS phase rolls over to Public, and
  // that rollover is partly time-based so the stored value goes stale on
  // its own. GTD/FCFS keep using their own configured allocation.
  const effectiveAllocation =
    key === "public" ? effectivePublicAllocation(collection) : config.allocation;

  if (racesAllocation && effectiveAllocation > 0 && config.minted + quantity > effectiveAllocation) {
    await PhaseClaim.updateOne({ _id: reserved._id }, { $inc: { count: -quantity } });
    return NextResponse.json({ error: "This phase is sold out" }, { status: 409 });
  }

  // Increment atomically first — the $lte guard is what actually prevents
  // overselling under concurrency, verified under real concurrent load.
  const updated = await Collection.findOneAndUpdate(
    {
      _id: id,
      [`mintPhases.${key}.enabled`]: true,
      ...(racesAllocation && effectiveAllocation > 0
        ? { [`mintPhases.${key}.minted`]: { $lte: effectiveAllocation - quantity } }
        : {}),
    },
    { $inc: { [`mintPhases.${key}.minted`]: quantity } },
    { new: true }
  ).select(`mintPhases.${key}`);
  if (!updated) {
    // The shared allocation ran out between the check above and this
    // increment — give the wallet its reserved units back rather than
    // silently consuming part of its cap for a mint that won't happen.
    await PhaseClaim.updateOne({ _id: reserved._id }, { $inc: { count: -quantity } });
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
  const allocation = key === "public" ? effectiveAllocation : updated.mintPhases[key].allocation;
  const sellsOut = racesAllocation && allocation > 0 && finalMinted >= allocation;
  if (sellsOut) {
    await Collection.updateOne(
      { _id: id, [`mintPhases.${key}.enabled`]: true },
      { $set: { [`mintPhases.${key}.enabled`]: false } }
    );
  }

  return NextResponse.json({
    claimed: alreadyClaimed + quantity,
    minted: finalMinted,
    allocation,
    soldOut: sellsOut,
  });
}
