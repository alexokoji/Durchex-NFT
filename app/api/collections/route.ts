import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { CategoryKey } from "@/components/ui/CategoryIcon";

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

type MintPhaseInput = { enabled?: boolean; priceEth?: number; allocation?: number; walletLimit?: number; allowlist?: string[] };
function normalizePhase(input: MintPhaseInput | undefined, requiresAllowlist = false) {
  const enabled = !!input?.enabled;
  const allowlist = [...new Set((input?.allowlist ?? []).map((address) => String(address).trim().toLowerCase()).filter((address) => /^0x[a-f0-9]{40}$/.test(address)))];
  return { enabled, priceEth: Math.max(0, Number(input?.priceEth ?? 0)), allocation: Math.max(0, Math.floor(Number(input?.allocation ?? 0))), walletLimit: Math.max(0, Math.floor(Number(input?.walletLimit ?? 0))), allowlist: requiresAllowlist ? allowlist : [] };
}

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
  const royaltyBps = Math.min(Math.max(Number(body.royaltyBps ?? 500), 0), 1000);
  const mintPhases = {
    whitelist: normalizePhase(body.mintPhases?.whitelist, true),
    og: normalizePhase(body.mintPhases?.og, true),
    public: normalizePhase(body.mintPhases?.public),
  };
  const maxSupply = Math.max(0, Math.floor(Number(body.maxSupply ?? 0)));
  const payoutRecipients = (Array.isArray(body.payoutRecipients) ? body.payoutRecipients : [])
    .map((p: { address?: string; shareBps?: number }) => ({ address: String(p.address ?? "").trim().toLowerCase(), shareBps: Math.max(0, Math.floor(Number(p.shareBps ?? 0))) }))
    .filter((p: { address: string; shareBps: number }) => /^0x[a-f0-9]{40}$/.test(p.address) && p.shareBps > 0);

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Collection name is required" }, { status: 400 });
  }
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if ([mintPhases.whitelist, mintPhases.og, mintPhases.public].some((phase) => phase.enabled && phase.allocation === 0)) {
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
    contractAddress: "",
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
      royaltyBps: collection.royaltyBps,
      maxSupply: collection.maxSupply,
      verified: false,
      items: 0,
    },
    { status: 201 }
  );
}
