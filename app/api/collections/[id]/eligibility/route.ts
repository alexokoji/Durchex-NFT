import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { PhaseClaim } from "@/lib/models/PhaseClaim";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { merkleProof, merkleRoot } from "@/lib/web3/merkle";
import { isPhaseLive, hasConfiguredPhases, PHASE_KEYS, PhaseKey } from "@/lib/mintPhases";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to check mint eligibility" }, { status: 401 });
  const { id } = await context.params;
  await connectDB();
  const collection = await Collection.findById(id).select("mintPhases").lean();
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  const claims = await PhaseClaim.find({ collection: id, wallet: user.address }).lean();
  const claimedByPhase = Object.fromEntries(claims.map((c) => [c.phase, c.count]));

  const result = PHASE_KEYS.reduce((all, phase) => {
    const config = collection.mintPhases?.[phase];
    if (!isPhaseLive(config)) {
      return { ...all, [phase]: { enabled: false, eligible: false, root: null, proof: [], claimed: 0, remaining: 0 } };
    }
    const addresses = (config.allowlist ?? []).filter((address: string) => isAddress(address));
    const claimed = claimedByPhase[phase] ?? 0;
    const eligible = phase === "public" || addresses.some((address: string) => address.toLowerCase() === user.address);
    return {
      ...all,
      [phase]: {
        enabled: true,
        eligible,
        root: merkleRoot(addresses),
        proof: merkleProof(addresses, user.address),
        claimed,
        remaining: config.walletLimit > 0 ? Math.max(0, config.walletLimit - claimed) : null,
      },
    };
  }, {} as Record<string, { enabled: boolean; eligible: boolean; root: string | null; proof: `0x${string}`[]; claimed: number; remaining: number | null }>);

  // Overall summary for gating the plain lazy-mint buy flow (not just the
  // drop-contract panel): does this collection use phases at all, and if
  // so, every currently-live phase this wallet can actually mint through
  // right now — GTD/FCFS/Public can all be live simultaneously, so the
  // buyer picks whichever one they're eligible for, not a single "active"
  // phase the system decides for them.
  const configured = hasConfiguredPhases(collection.mintPhases as never);
  // Split in two steps so "no phase open" and "phase's open, but this
  // wallet already used up its cap" can be told apart — otherwise both
  // collapse into the same canMint:false with no way for the UI to explain
  // which one actually happened.
  const liveEligiblePhases = configured ? PHASE_KEYS.filter((key) => result[key].enabled && result[key].eligible) : [];
  const eligiblePhases: PhaseKey[] = liveEligiblePhases.filter((key) => result[key].remaining !== 0);
  const gate = {
    configured,
    eligiblePhases,
    canMint: !configured || eligiblePhases.length > 0,
    // True only when a phase this wallet qualifies for is genuinely open,
    // and the sole reason it can't mint is its own per-wallet cap — not
    // when nothing is open at all, which needs a different message.
    walletCapReached: configured && liveEligiblePhases.length > 0 && eligiblePhases.length === 0,
  };

  return NextResponse.json({ ...result, gate });
}
