import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { PRIMARY_CHAIN_IDS } from "@/lib/web3/config";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to attach a contract" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json();
  const address = String(body.contractAddress ?? "");
  const chainId = Number(body.chainId);
  if (!isAddress(address) || !(PRIMARY_CHAIN_IDS as readonly number[]).includes(chainId)) return NextResponse.json({ error: "Use a valid deployed contract on a supported production network." }, { status: 400 });
  await connectDB();
  const collection = await Collection.findById(id);
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  if (String(collection.creator) !== String(user._id)) return NextResponse.json({ error: "Only the collection creator can attach its contract." }, { status: 403 });
  collection.contractAddress = getAddress(address);
  collection.chainId = chainId;
  collection.contractType = body.contractType === "drop" ? "drop" : "lazy";
  await collection.save();
  return NextResponse.json({ id: String(collection._id), contractAddress: collection.contractAddress, chainId: collection.chainId, contractType: collection.contractType });
}
