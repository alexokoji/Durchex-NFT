import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
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
import { collectionSalt, factoryFor, predictCloneAddress } from "@/lib/web3/collectionFactory";
import { checkCreationAllowed } from "@/lib/creationGate";
import { checkDelegation, delegationWarning } from "@/lib/web3/delegatedWallet";

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
  // Browsing is public, so hidden collections are excluded — but "mine"
  // is the creator's own list, where hiding it from them too would just
  // look like their collection vanished.
  const docs = await Collection.find(mine ? { creator: user!._id } : { hidden: { $ne: true } })
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

  await connectDB();
  const gate = await checkCreationAllowed(user.address);
  if (!gate.allowed) return NextResponse.json({ error: gate.error }, { status: 403 });

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
  // Split recipients are payout addresses in exactly the sense the creator
  // address is, so they get the same EIP-7702 screening — a delegated
  // wallet among the splits would quietly forward its share to a sweeper.
  for (const recipient of payoutRecipients as { address: string }[]) {
    const delegation = await checkDelegation(recipient.address, DEFAULT_NFT_CHAIN_ID);
    if (delegation.delegated) {
      return NextResponse.json(
        { error: `Payout wallet ${recipient.address} can't be used. ${delegationWarning(delegation.target)}` },
        { status: 400 }
      );
    }
  }

  await connectDB();
  const baseSlug = slugify(name) || "collection";
  let slug = baseSlug;
  let suffix = 1;
  while (await Collection.exists({ slug })) {
    slug = `${baseSlug}-${++suffix}`;
  }

  // Collections get their own dedicated contract when a factory is live on
  // the target chain — deployed lazily at first mint (see BuyLazyButton and
  // BuyEditionButton), not here, so a collection that never sells never
  // costs anyone gas. The address itself is pure CREATE2
  // arithmetic and needs no chain call, but it does need the collection's
  // real _id, so that's generated up front instead of left to Mongo.
  // Both standards now have their own factory, so this applies to ERC-1155
  // collections too. A chain with no factory recorded falls back to the
  // shared contract, exactly as every collection behaved before this.
  const _id = new Types.ObjectId();
  const targetChainId = standard === "ERC1155" ? DEFAULT_NFT1155_CHAIN_ID : DEFAULT_NFT_CHAIN_ID;
  const deployTarget = factoryFor(standard, targetChainId);
  const clonedContractAddress = deployTarget
    ? predictCloneAddress({
        implementation: deployTarget.implementation,
        salt: collectionSalt(_id.toString()),
        factory: deployTarget.factory,
      })
    : null;

  const collection = await Collection.create({
    _id,
    slug,
    name,
    description,
    logoUrl,
    bannerUrl,
    category,
    creator: user._id,
    royaltyBps,
    standard,
    contractAddress: clonedContractAddress ?? (standard === "ERC1155" ? DEFAULT_NFT1155_ADDRESS : DEFAULT_NFT_ADDRESS),
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
