import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { normalizePhase, computePublicAllocation, effectivePublicAllocation } from "@/lib/mintPhases";
import { Item } from "@/lib/models/Item";
import { isMintedOut } from "@/lib/listing";
import { deleteCollectionCascade } from "@/lib/deleteCollection";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  await connectDB();
  const collection = await Collection.findById(id)
    .select("creator mintPhases listingEnabled listingOpensAt maxSupply")
    .lean();
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  if (String(collection.creator) !== String(user._id)) {
    return NextResponse.json({ error: "Only the creator can manage this collection" }, { status: 403 });
  }
  // Mint progress travels with this so the creator's listing control can
  // explain why it's locked and how far off opening is, rather than just
  // refusing when they try.
  const [mintedSupply, unmintedCount] = await Promise.all([
    Item.countDocuments({ collection: collection._id, isMinted: true }),
    Item.countDocuments({ collection: collection._id, isMinted: false }),
  ]);
  return NextResponse.json({
    mintPhases: collection.mintPhases,
    listingEnabled: collection.listingEnabled,
    listingOpensAt: collection.listingOpensAt,
    mintedOut: isMintedOut({ maxSupply: collection.maxSupply, mintedSupply, unmintedCount }),
    mintedSupply,
    unmintedCount,
    maxSupply: collection.maxSupply,
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
    // Resale can't be opened, or scheduled, until the collection is fully
    // minted out — otherwise resale runs alongside the creator's own
    // primary sale and undercuts it. Checked here rather than trusted from
    // the client, since this is the whole rule.
    const [mintedSupply, unmintedCount] = await Promise.all([
      Item.countDocuments({ collection: collection._id, isMinted: true }),
      Item.countDocuments({ collection: collection._id, isMinted: false }),
    ]);
    const mintedOut = isMintedOut({ maxSupply: collection.maxSupply, mintedSupply, unmintedCount });
    const wantsToOpen = body.listing.enabled === true || !!body.listing.opensAt;
    if (!mintedOut && wantsToOpen) {
      const remaining = collection.maxSupply > 0 ? collection.maxSupply - mintedSupply : unmintedCount;
      return NextResponse.json(
        {
          error: `Resale opens once this collection is fully minted — ${remaining} still to mint.`,
          mintedOut: false,
        },
        { status: 409 }
      );
    }

    if (typeof body.listing.enabled === "boolean") collection.listingEnabled = body.listing.enabled;
    if ("opensAt" in body.listing) {
      collection.listingOpensAt = body.listing.opensAt ? new Date(body.listing.opensAt) : null;
    }
    await collection.save();
    return NextResponse.json({
      mintPhases: collection.mintPhases,
      listingEnabled: collection.listingEnabled,
      listingOpensAt: collection.listingOpensAt,
      mintedOut,
    });
  }

  // Mint configuration is frozen once the collection is minted out. Prices,
  // allocations and windows are the terms buyers minted under; rewriting
  // them afterwards would rewrite the record of a sale that already
  // happened. Resale settings above are deliberately still editable —
  // opening resale is precisely what a creator does after minting out.
  const [mintedSupply, unmintedCount] = await Promise.all([
    Item.countDocuments({ collection: collection._id, isMinted: true }),
    Item.countDocuments({ collection: collection._id, isMinted: false }),
  ]);
  if (isMintedOut({ maxSupply: collection.maxSupply, mintedSupply, unmintedCount })) {
    return NextResponse.json(
      {
        error: "This collection is fully minted — its mint phases can no longer be changed.",
        mintedOut: true,
      },
      { status: 409 }
    );
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

  // Public: enabled/priceEth/walletLimit are user-set — allocation is
  // always derived from GTD/FCFS + max supply, schedule is always cleared.
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
  // Whether Public has anything to sell is judged on what GTD/FCFS are
  // *still* holding, not on their original reservations: a phase that has
  // ended or sold out releases its unminted remainder. Using the static
  // figure here would permanently lock Public off for any launch that
  // reserved 100% up front, even once those phases finished undersold.
  const openablePublicAllocation = effectivePublicAllocation({
    maxSupply: collection.maxSupply,
    mintPhases: collection.mintPhases,
  });
  const soldOutBeforeOpening = collection.maxSupply > 0 && openablePublicAllocation === 0;
  collection.mintPhases.public = {
    enabled: soldOutBeforeOpening ? false : requestedPublicEnabled,
    priceEth: Math.max(0, Number(patch.public?.priceEth ?? currentPublic.priceEth)),
    allocation: publicAllocation,
    walletLimit: Math.max(0, Math.floor(Number(patch.public?.walletLimit ?? currentPublic.walletLimit))),
    minted: currentPublic.minted,
    startsAt: null,
    endsAt: null,
  };

  await collection.save();
  return NextResponse.json({ mintPhases: collection.mintPhases });
}

// Creator-side deletion. The rule and the cascade live in
// lib/deleteCollection.ts, shared with the admin panel.
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  await connectDB();
  const collection = await Collection.findById(id).select("creator").lean();
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  if (String(collection.creator) !== String(user._id)) {
    return NextResponse.json({ error: "Only the creator can delete this collection" }, { status: 403 });
  }

  const result = await deleteCollectionCascade(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, mintedSupply: result.mintedSupply }, { status: result.status });
  }
  return NextResponse.json({ deleted: true, slug: result.slug, items: result.items });
}
