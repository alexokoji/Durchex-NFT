import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Item } from "@/lib/models/Item";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { rootForTokenIds } from "@/lib/web3/offerCriteria";

/**
 * Returns the merkle root committing to the NFTs eligible to fill an offer
 * on this collection. Derived here rather than in the browser so a buyer
 * can't sign a root covering items outside the collection (all collections
 * share one deployed NFT contract, so the contract alone can't tell them
 * apart — the root is what makes membership verifiable on-chain).
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid collection" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const criteria = body.criteria as { traitType?: string; values?: string[] } | null;

  await connectDB();
  const query: Record<string, unknown> = { collection: new Types.ObjectId(id), tokenId: { $ne: null } };
  if (criteria?.traitType && criteria.values?.length) {
    query.traits = { $elemMatch: { trait_type: criteria.traitType, value: { $in: criteria.values } } };
  }
  const items = await Item.find(query).select("tokenId").lean();
  const tokenIds = items.map((i) => String(i.tokenId)).filter(Boolean);

  if (tokenIds.length === 0) {
    return NextResponse.json(
      { error: "No minted NFTs in this collection match that criteria yet, so an offer can't be secured against it" },
      { status: 400 }
    );
  }

  return NextResponse.json({ criteriaRoot: rootForTokenIds(tokenIds), eligibleCount: tokenIds.length });
}
