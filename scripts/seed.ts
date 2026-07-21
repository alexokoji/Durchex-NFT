import { connectDB } from "../lib/db";
import { User } from "../lib/models/User";
import { Collection } from "../lib/models/Collection";
import { Item } from "../lib/models/Item";
import { Activity } from "../lib/models/Activity";
import type { CategoryKey } from "../components/ui/CategoryIcon";
import mongoose from "mongoose";

const COLLECTIONS: { name: string; category: CategoryKey; verified: boolean }[] = [
  { name: "Neon Ronin", category: "pfp", verified: true },
  { name: "Chroma Dreams", category: "art", verified: true },
  { name: "Pixel Raiders", category: "gaming", verified: true },
  { name: "Sonic Fragments", category: "music", verified: false },
  { name: "Silver Halide", category: "photography", verified: true },
  { name: "Court Legends", category: "sports", verified: false },
  { name: "Metaborough", category: "virtual-worlds", verified: true },
  { name: "Relics of Nowhere", category: "collectibles", verified: false },
  { name: "Ink Wraiths", category: "art", verified: false },
  { name: "Glitch Fauna", category: "pfp", verified: true },
];

const ITEM_ADJ = [
  "Cosmic", "Shadow", "Velvet", "Obsidian", "Crimson", "Astral", "Neon", "Fractured",
  "Silent", "Glacial", "Radiant", "Feral", "Hollow", "Prismatic", "Void", "Ember",
];
const ITEM_NOUN = [
  "Wanderer", "Oracle", "Serpent", "Monarch", "Drifter", "Sentinel", "Phantom", "Reliquary",
  "Cipher", "Warden", "Nomad", "Specter", "Titan", "Vagrant", "Herald", "Wraith",
];

function randOf<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randFloat(min: number, max: number, decimals = 2) {
  return Number((min + Math.random() * (max - min)).toFixed(decimals));
}

async function main() {
  await connectDB();
  console.log("Connected. Clearing existing data...");
  await Promise.all([
    User.deleteMany({}),
    Collection.deleteMany({}),
    Item.deleteMany({}),
    Activity.deleteMany({}),
  ]);

  const creators = await User.insertMany(
    Array.from({ length: 10 }).map((_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, "0")}`,
      username: `creator${i + 1}`,
      bio: "Full-time digital artist & collector.",
      isVerified: i % 3 === 0,
      followerCount: Math.floor(Math.random() * 5000),
      followingCount: Math.floor(Math.random() * 300),
    }))
  );

  let totalItems = 0;

  // A handful of collections are scheduled "drops" for the /drops page: one
  // already live, one starting soon, one starting in a few days.
  const DROP_SCHEDULE: Record<number, { startInHours: number; durationHours: number }> = {
    0: { startInHours: -6, durationHours: 48 }, // live now
    3: { startInHours: 2, durationHours: 24 }, // starting soon
    6: { startInHours: 72, durationHours: 24 }, // upcoming
  };

  for (const [index, c] of COLLECTIONS.entries()) {
    const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const itemCount = 8 + Math.floor(Math.random() * 10);
    const creator = randOf(creators);
    const drop = DROP_SCHEDULE[index];

    const collection = await Collection.create({
      slug,
      name: c.name,
      description: `${c.name} is a curated collection exploring ${c.category} on-chain.`,
      contractAddress: `0x${Math.floor(Math.random() * 1e16).toString(16).padStart(40, "0")}`,
      category: c.category,
      creator: creator._id,
      verified: c.verified,
      royaltyBps: [250, 500, 750][Math.floor(Math.random() * 3)],
      dropStartsAt: drop ? new Date(Date.now() + drop.startInHours * 60 * 60 * 1000) : null,
      dropEndsAt: drop
        ? new Date(Date.now() + (drop.startInHours + drop.durationHours) * 60 * 60 * 1000)
        : null,
      stats: {
        floorEth: 0,
        volume24hEth: 0,
        volume7dEth: 0,
        totalVolumeEth: 0,
        volumeChangePct: randFloat(-18, 42, 1),
        owners: Math.floor(itemCount * randFloat(0.5, 0.9)),
        items: itemCount,
        sales: 0,
      },
    });

    const prices: number[] = [];
    let volume24h = 0;

    for (let i = 0; i < itemCount; i++) {
      const isAuction = Math.random() < 0.22;
      const isMinted = Math.random() > 0.35;
      const isSold = !isAuction && Math.random() < 0.15;
      const price = randFloat(0.05, 8.5);
      prices.push(price);

      const status = isSold ? "sold" : isAuction ? "auction" : "fixed_price";
      if (status !== "sold") volume24h += Math.random() < 0.3 ? price : 0;

      const owner = randOf(creators);
      const daysAgo = randFloat(0, 21, 2);
      const listedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

      const item = await Item.create({
        collection: collection._id,
        tokenId: isMinted ? String(i + 1) : null,
        isMinted,
        owner: owner._id,
        creator: creator._id,
        name: `${randOf(ITEM_ADJ)} ${randOf(ITEM_NOUN)} #${i + 1}`,
        description: `A one-of-one piece from the ${c.name} collection.`,
        traits: [
          { trait_type: "Background", value: randOf(["Nebula", "Void", "Aurora", "Static"]), rarity: randFloat(2, 40, 1) },
          { trait_type: "Aura", value: randOf(["Violet", "Rose", "Amethyst", "Indigo"]), rarity: randFloat(2, 40, 1) },
        ],
        status,
        priceEth: status === "auction" ? price : price,
        highestBidEth: status === "auction" ? Number((price * 0.85).toFixed(2)) : 0,
        auctionEndsAt: status === "auction" ? new Date(Date.now() + Math.random() * 1000 * 60 * 60 * 48) : null,
        favoriteCount: Math.floor(Math.random() * 400),
        viewCount: Math.floor(Math.random() * 5000),
        voucher: !isMinted
          ? {
              tokenId: String(i + 1),
              uri: `ipfs://placeholder/${slug}/${i + 1}.json`,
              minPrice: String(Math.floor(price * 1e18)),
              creator: `0x${(i + 1).toString(16).padStart(40, "0")}`,
              royaltyBps: 500,
              signature: "0x" + "0".repeat(130),
              nonce: 0,
            }
          : undefined,
        createdAt: listedAt,
      });
      totalItems++;

      await Activity.create({
        type: isMinted ? "mint" : "list",
        item: item._id,
        from: creator._id,
        priceEth: price,
        createdAt: listedAt,
      });
      if (status === "sold") {
        const soldAt = new Date(listedAt.getTime() + randFloat(0.5, 5, 2) * 24 * 60 * 60 * 1000);
        await Activity.create({
          type: "sale",
          item: item._id,
          from: creator._id,
          to: owner._id,
          priceEth: price,
          createdAt: soldAt,
        });
      }
    }

    const floor = Math.min(...prices);
    await Collection.updateOne(
      { _id: collection._id },
      {
        $set: {
          "stats.floorEth": Number(floor.toFixed(3)),
          "stats.volume24hEth": Number(volume24h.toFixed(2)),
          "stats.volume7dEth": Number((volume24h * randFloat(4, 7)).toFixed(2)),
          "stats.totalVolumeEth": Number((volume24h * randFloat(20, 60)).toFixed(2)),
        },
      }
    );
  }

  console.log(`Seeded ${COLLECTIONS.length} collections and ${totalItems} items.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
