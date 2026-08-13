import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { merkleProof, merkleRoot } from "@/lib/web3/merkle";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to check mint eligibility" }, { status: 401 });
  const { id } = await context.params;
  await connectDB();
  const collection = await Collection.findById(id).select("mintPhases").lean();
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  const result = (['whitelist', 'og'] as const).reduce((all, phase) => {
    const config = collection.mintPhases?.[phase];
    const addresses = (config?.allowlist ?? []).filter((address: string) => isAddress(address));
    return { ...all, [phase]: { eligible: addresses.some((address: string) => address.toLowerCase() === user.address), root: merkleRoot(addresses), proof: merkleProof(addresses, user.address) } };
  }, {} as Record<string, { eligible: boolean; root: string | null; proof: `0x${string}`[] }>);
  return NextResponse.json(result);
}
