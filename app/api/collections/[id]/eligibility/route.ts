import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { PhaseClaim } from "@/lib/models/PhaseClaim";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { merkleProof, merkleRoot } from "@/lib/web3/merkle";
import { isPhaseLive } from "@/lib/mintPhases";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to check mint eligibility" }, { status: 401 });
  const { id } = await context.params;
  await connectDB();
  const collection = await Collection.findById(id).select("mintPhases").lean();
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  const claims = await PhaseClaim.find({ collection: id, wallet: user.address }).lean();
  const claimedByPhase = Object.fromEntries(claims.map((c) => [c.phase, c.count]));

  const result = (['whitelist', 'og'] as const).reduce((all, phase) => {
    const config = collection.mintPhases?.[phase];
    if (!isPhaseLive(config)) {
      return { ...all, [phase]: { enabled: false, eligible: false, root: null, proof: [], claimed: 0, remaining: 0 } };
    }
    const addresses = (config.allowlist ?? []).filter((address: string) => isAddress(address));
    const claimed = claimedByPhase[phase] ?? 0;
    return {
      ...all,
      [phase]: {
        enabled: true,
        eligible: addresses.some((address: string) => address.toLowerCase() === user.address),
        root: merkleRoot(addresses),
        proof: merkleProof(addresses, user.address),
        claimed,
        remaining: config.walletLimit > 0 ? Math.max(0, config.walletLimit - claimed) : null,
      },
    };
  }, {} as Record<string, { enabled: boolean; eligible: boolean; root: string | null; proof: `0x${string}`[]; claimed: number; remaining: number | null }>);
  return NextResponse.json(result);
}
