import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { alchemyAvailable, getNftsForOwner } from "@/lib/web3/alchemy";

export const dynamic = "force-dynamic";

/**
 * Everything a wallet holds on-chain, wherever it was minted.
 *
 * Each NFT is matched against our own records so the UI can tell the two
 * apart: something already on Durchex links to its item page, anything
 * else is an outside holding the owner can bring in. Matching is done here
 * rather than in the browser because it needs the database.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const address = String(url.searchParams.get("address") ?? "");
  const chainId = Number(url.searchParams.get("chainId") ?? 1);
  const pageKey = url.searchParams.get("pageKey") ?? undefined;

  if (!isAddress(address)) {
    return NextResponse.json({ error: "A valid wallet address is required" }, { status: 400 });
  }
  if (!alchemyAvailable(chainId)) {
    // Not an error the viewer can act on, so it reads as "nothing to show"
    // with a reason rather than a failure.
    return NextResponse.json({ nfts: [], pageKey: null, unavailable: true });
  }

  let page;
  try {
    page = await getNftsForOwner({ owner: address, chainId, pageKey });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't read this wallet" },
      { status: 502 }
    );
  }

  await connectDB();
  const contracts = [...new Set(page.nfts.map((n) => n.contractAddress))];
  const known = await Collection.find({
    contractAddress: { $regex: `^(${contracts.join("|")})$`, $options: "i" },
  })
    .select("_id slug name contractAddress")
    .lean();
  const bySlugContract = new Map(known.map((c) => [c.contractAddress.toLowerCase(), c]));

  // Only tokens in a collection we actually host can have an item page.
  const items = known.length
    ? await Item.find({ collection: { $in: known.map((c) => c._id) } })
        .select("_id tokenId collection")
        .lean()
    : [];
  const itemKey = (collectionId: string, tokenId: string) => `${collectionId}:${tokenId}`;
  const itemLookup = new Map(
    items.filter((i) => i.tokenId).map((i) => [itemKey(String(i.collection), String(i.tokenId)), String(i._id)])
  );

  return NextResponse.json({
    pageKey: page.pageKey,
    nfts: page.nfts.map((n) => {
      const collection = bySlugContract.get(n.contractAddress);
      const itemId = collection ? itemLookup.get(itemKey(String(collection._id), n.tokenId)) : undefined;
      return {
        ...n,
        onDurchex: !!itemId,
        itemId: itemId ?? null,
        collectionSlug: collection?.slug ?? null,
        collectionName: collection?.name ?? n.collectionName,
      };
    }),
  });
}
