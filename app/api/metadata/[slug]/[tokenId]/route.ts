import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string; tokenId: string }> }) {
  const { slug, tokenId } = await context.params;
  await connectDB();
  const collection = await Collection.findOne({ slug }).select("_id name").lean();
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  const item = await Item.findOne({ collection: collection._id, tokenId }).lean();
  if (!item) return NextResponse.json({ error: "NFT metadata not found" }, { status: 404 });
  return NextResponse.json({
    name: item.name,
    description: item.description || undefined,
    image: item.mediaUrl || undefined,
    animation_url: item.mediaType?.startsWith("video/") || item.mediaType?.startsWith("audio/") ? item.mediaUrl : undefined,
    attributes: (item.traits ?? []).map((trait: { trait_type: string; value: string }) => ({ trait_type: trait.trait_type, value: trait.value })),
  });
}
