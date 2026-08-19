import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { CategoryKey } from "@/components/ui/CategoryIcon";
import { normalizePhase, computePublicAllocation } from "@/lib/mintPhases";
import {
  DEFAULT_NFT_ADDRESS,
  DEFAULT_NFT_CHAIN_ID,
  DEFAULT_NFT1155_ADDRESS,
  DEFAULT_NFT1155_CHAIN_ID,
} from "@/lib/web3/deployedContract";

const CATEGORIES: CategoryKey[] = [
  "art",
  "pfp",
  "gaming",
  "music",
  "photography",
  "sports",
  "virtual-worlds",
  "collectibles",
];

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(req: NextRequest) {
  const mine = new URL(req.url).searchParams.get("mine") === "1";
  const user = mine ? await getCurrentUser(req) : null;
  if (mine && !user) {
    return NextResponse.json({ error: "Sign in to view your collections" }, { status: 401 });
  }
  await connectDB();
  const docs = await Collection.find(mine ? { creator: user!._id } : {})
    .select("slug name category logoUrl bannerUrl contractAddress contractType chainId royaltyBps maxSupply verified stats.items")
    .sort({ name: 1 })
    .lean();

  return NextResponse.json({
    collections: docs.map((c) => ({
      id: String(c._id),
      slug: c.slug,
      name: c.name,
      category: c.category,
      logoUrl: c.logoUrl,
      bannerUrl: c.bannerUrl,
      contractAddress: c.contractAddress,
      contractType: c.contractType,
      chainId: c.chainId,
      royaltyBps: c.royaltyBps,
      maxSupply: c.maxSupply,
      verified: c.verified,
      items: c.stats?.items ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in to create a collection" }, { status: 401 });
  }

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const category = body.category as CategoryKey;
  const description = String(body.description ?? "").trim();
  const logoUrl = String(body.logoUrl ?? "").trim();
  const bannerUrl = String(body.bannerUrl ?? "").trim();
  const royaltyBps = Math.min(Math.max(Number(body.royaltyBps ?? 500), 0), 3000);
  const maxSupply = Math.max(0, Math.floor(Number(body.maxSupply ?? 0)));
  const standard = body.standard === "ERC1155" ? "ERC1155" : "ERC721";
  const whitelistPhase = normalizePhase(body.mintPhases?.whitelist, true);
  const ogPhase = normalizePhase(body.mintPhases?.og, true);
  // Public has no allocation/schedule of its own — supply is whatever's
  // left of maxSupply after GTD (whitelist) + FCFS (og), or unlimited if
  // maxSupply isn't set. Its wallet cap, unlike allocation, isn't derived
  // from anything — the creator sets it directly, same as the other phases.
  const publicAllocation = computePublicAllocation(maxSupply, whitelistPhase.allocation, ogPhase.allocation);
  const soldOutBeforeOpening = maxSupply > 0 && publicAllocation === 0;
  const mintPhases = {
    whitelist: whitelistPhase,
    og: ogPhase,
    public: {
      enabled: soldOutBeforeOpening ? false : !!body.mintPhases?.public?.enabled,
      priceEth: Math.max(0, Number(body.mintPhases?.public?.priceEth ?? 0)),
      allocation: publicAllocation,
      walletLimit: Math.max(0, Math.floor(Number(body.mintPhases?.public?.walletLimit ?? 0))),
      startsAt: null,
      endsAt: null,
    },
  };
  const payoutRecipients = (Array.isArray(body.payoutRecipients) ? body.payoutRecipients : [])
    .map((p: { address?: string; shareBps?: number }) => ({ address: String(p.address ?? "").trim().toLowerCase(), shareBps: Math.max(0, Math.floor(Number(p.shareBps ?? 0))) }))
    .filter((p: { address: string; shareBps: number }) => /^0x[a-f0-9]{40}$/.test(p.address) && p.shareBps > 0);

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Collection name is required" }, { status: 400 });
  }
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if ([mintPhases.whitelist, mintPhases.og].some((phase) => phase.enabled && phase.allocation === 0)) {
    return NextResponse.json({ error: "Each enabled mint phase needs a supply allocation." }, { status: 400 });
  }
  if ((mintPhases.whitelist.enabled && mintPhases.whitelist.allowlist.length === 0) || (mintPhases.og.enabled && mintPhases.og.allowlist.length === 0)) {
    return NextResponse.json({ error: "Whitelist and OG phases need at least one valid wallet address." }, { status: 400 });
  }

  await connectDB();
  const baseSlug = slugify(name) || "collection";
  let slug = baseSlug;
  let suffix = 1;
  while (await Collection.exists({ slug })) {
    slug = `${baseSlug}-${++suffix}`;
  }

  const collection = await Collection.create({
    slug,
    name,
    description,
    logoUrl,
    bannerUrl,
    category,
    creator: user._id,
    royaltyBps,
    standard,
    contractAddress: standard === "ERC1155" ? DEFAULT_NFT1155_ADDRESS : DEFAULT_NFT_ADDRESS,
    chainId: standard === "ERC1155" ? DEFAULT_NFT1155_CHAIN_ID : DEFAULT_NFT_CHAIN_ID,
    contractType: "lazy",
    maxSupply,
    payoutRecipients,
    mintPhases,
  });

  return NextResponse.json(
    {
      id: String(collection._id),
      slug: collection.slug,
      name: collection.name,
      category: collection.category,
      logoUrl: collection.logoUrl,
      bannerUrl: collection.bannerUrl,
      contractAddress: collection.contractAddress,
      contractType: collection.contractType,
      chainId: collection.chainId,
      standard: collection.standard,
      royaltyBps: collection.royaltyBps,
      maxSupply: collection.maxSupply,
      verified: false,
      items: 0,
    },
    { status: 201 }
  );
}
