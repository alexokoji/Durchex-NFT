import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { normalizePhase } from "@/lib/mintPhases";

const PHASES = ["whitelist", "og", "public"] as const;

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  await connectDB();
  const collection = await Collection.findById(id).select("creator mintPhases").lean();
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  if (String(collection.creator) !== String(user._id)) {
    return NextResponse.json({ error: "Only the creator can manage this collection" }, { status: 403 });
  }
  return NextResponse.json({ mintPhases: collection.mintPhases });
}

// Partial update: any subset of phases/fields may be sent, e.g.
// { mintPhases: { whitelist: { enabled: false }, public: { enabled: true } } }
// to disable one phase and enable the next without touching the others.
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  await connectDB();
  const collection = await Collection.findById(id);
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  if (String(collection.creator) !== String(user._id)) {
    return NextResponse.json({ error: "Only the creator can manage this collection" }, { status: 403 });
  }

  const body = await req.json();
  const patch = body.mintPhases ?? {};

  for (const phase of PHASES) {
    if (!(phase in patch)) continue;
    const requiresAllowlist = phase !== "public";
    const current = collection.mintPhases[phase];
    const merged = normalizePhase(
      {
        enabled: patch[phase].enabled ?? current.enabled,
        priceEth: patch[phase].priceEth ?? current.priceEth,
        allocation: patch[phase].allocation ?? current.allocation,
        walletLimit: patch[phase].walletLimit ?? current.walletLimit,
        allowlist: patch[phase].allowlist ?? current.allowlist,
      },
      requiresAllowlist
    );
    if (merged.enabled && merged.allocation === 0) {
      return NextResponse.json({ error: `${phase} phase needs a supply allocation to be enabled.` }, { status: 400 });
    }
    if (merged.enabled && requiresAllowlist && merged.allowlist.length === 0) {
      return NextResponse.json({ error: `${phase} phase needs at least one wallet on its allowlist to be enabled.` }, { status: 400 });
    }
    if (merged.allocation > 0 && merged.allocation < current.minted) {
      return NextResponse.json({ error: `${phase} already has ${current.minted} minted — allocation can't go below that.` }, { status: 400 });
    }
    collection.mintPhases[phase] = { ...merged, minted: current.minted };
  }

  await collection.save();
  return NextResponse.json({ mintPhases: collection.mintPhases });
}
