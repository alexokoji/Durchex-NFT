import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { normalizePhase, computePublicAllocation } from "@/lib/mintPhases";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  await connectDB();
  const collection = await Collection.findById(id).select("creator mintPhases listingEnabled listingOpensAt").lean();
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  if (String(collection.creator) !== String(user._id)) {
    return NextResponse.json({ error: "Only the creator can manage this collection" }, { status: 403 });
  }
  return NextResponse.json({
    mintPhases: collection.mintPhases,
    listingEnabled: collection.listingEnabled,
    listingOpensAt: collection.listingOpensAt,
  });
}

// Partial update: any subset of phases/fields may be sent, e.g.
// { mintPhases: { whitelist: { enabled: false }, public: { enabled: true } } }
// to disable one phase and enable the next without touching the others.
//
// "public" is special: it has no allocation/walletLimit/schedule of its
// own — its allocation is always recomputed from maxSupply minus whatever
// GTD (whitelist) and FCFS (og) have reserved, so it stays correct even
// when only whitelist/og are patched and "public" isn't mentioned at all.
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

  if (body.listing) {
    if (typeof body.listing.enabled === "boolean") collection.listingEnabled = body.listing.enabled;
    if ("opensAt" in body.listing) {
      collection.listingOpensAt = body.listing.opensAt ? new Date(body.listing.opensAt) : null;
    }
    await collection.save();
    return NextResponse.json({
      mintPhases: collection.mintPhases,
      listingEnabled: collection.listingEnabled,
      listingOpensAt: collection.listingOpensAt,
    });
  }

  const patch = body.mintPhases ?? {};

  for (const phase of ["whitelist", "og"] as const) {
    if (!(phase in patch)) continue;
    const current = collection.mintPhases[phase];
    const merged = normalizePhase(
      {
        enabled: patch[phase].enabled ?? current.enabled,
        priceEth: patch[phase].priceEth ?? current.priceEth,
        allocation: patch[phase].allocation ?? current.allocation,
        walletLimit: patch[phase].walletLimit ?? current.walletLimit,
        allowlist: patch[phase].allowlist ?? current.allowlist,
        startsAt: "startsAt" in patch[phase] ? patch[phase].startsAt : current.startsAt,
        endsAt: "endsAt" in patch[phase] ? patch[phase].endsAt : current.endsAt,
      },
      true
    );
    if (merged.enabled && merged.allocation === 0) {
      return NextResponse.json({ error: `${phase} phase needs a supply allocation to be enabled.` }, { status: 400 });
    }
    if (merged.enabled && merged.allowlist.length === 0) {
      return NextResponse.json({ error: `${phase} phase needs at least one wallet on its allowlist to be enabled.` }, { status: 400 });
    }
    if (merged.allocation > 0 && merged.allocation < current.minted) {
      return NextResponse.json({ error: `${phase} already has ${current.minted} minted — allocation can't go below that.` }, { status: 400 });
    }
    collection.mintPhases[phase] = { ...merged, minted: current.minted };
  }

  // Public: only enabled/priceEth are ever user-set — allocation is
  // always derived, walletLimit/schedule are always cleared.
  const currentPublic = collection.mintPhases.public;
  const publicAllocation = computePublicAllocation(
    collection.maxSupply,
    collection.mintPhases.whitelist.allocation,
    collection.mintPhases.og.allocation
  );
  if (publicAllocation > 0 && publicAllocation < currentPublic.minted) {
    return NextResponse.json(
      { error: `Public already has ${currentPublic.minted} minted — GTD/FCFS can't reserve more than the remaining supply.` },
      { status: 400 }
    );
  }
  const requestedPublicEnabled = patch.public?.enabled ?? currentPublic.enabled;
  // maxSupply > 0 but nothing left over after GTD/FCFS — can't be open.
  const soldOutBeforeOpening = collection.maxSupply > 0 && publicAllocation === 0;
  collection.mintPhases.public = {
    enabled: soldOutBeforeOpening ? false : requestedPublicEnabled,
    priceEth: Math.max(0, Number(patch.public?.priceEth ?? currentPublic.priceEth)),
    allocation: publicAllocation,
    walletLimit: 0,
    minted: currentPublic.minted,
    startsAt: null,
    endsAt: null,
  };

  await collection.save();
  return NextResponse.json({ mintPhases: collection.mintPhases });
}
