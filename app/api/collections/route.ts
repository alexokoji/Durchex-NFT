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

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET() {
  await connectDB();
  const docs = await Collection.find()
    .select("slug name category contractAddress chainId royaltyBps verified stats.items")
    .sort({ name: 1 })
    .lean();

  return NextResponse.json({
    collections: docs.map((c) => ({
      id: String(c._id),
      slug: c.slug,
      name: c.name,
      category: c.category,
      contractAddress: c.contractAddress,
      chainId: c.chainId,
      royaltyBps: c.royaltyBps,
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
  const royaltyBps = Math.min(Math.max(Number(body.royaltyBps ?? 500), 0), 1000);

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Collection name is required" }, { status: 400 });
  }
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
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
    category,
    creator: user._id,
    royaltyBps,
    contractAddress: "",
  });

  return NextResponse.json(
    {
      id: String(collection._id),
      slug: collection.slug,
      name: collection.name,
      category: collection.category,
      contractAddress: collection.contractAddress,
      chainId: collection.chainId,
      royaltyBps: collection.royaltyBps,
      verified: false,
      items: 0,
    },
    { status: 201 }
  );
}
