import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { PhaseClaim } from "@/lib/models/PhaseClaim";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { merkleProof, merkleRoot } from "@/lib/web3/merkle";
import { isPhaseLive, hasConfiguredPhases, pickActivePhase, PHASE_KEYS } from "@/lib/mintPhases";

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
  // so, is the connected wallet actually allowed to mint right now.
  const configured = hasConfiguredPhases(collection.mintPhases as never);
  const activePhase = configured ? pickActivePhase(collection.mintPhases as never) : null;
  const gate = {
    configured,
    activePhase,
    canMint: !configured || (activePhase !== null && result[activePhase].eligible && result[activePhase].remaining !== 0),
  };

  return NextResponse.json({ ...result, gate });
}
