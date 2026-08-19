import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { ItemBalance } from "@/lib/models/ItemBalance";
import { collectionMintProgress } from "@/lib/collectionSupply";
import { User } from "@/lib/models/User";
import { Favorite } from "@/lib/models/Favorite";
import { Bid } from "@/lib/models/Bid";
import { CollectionOffer } from "@/lib/models/CollectionOffer";
import { Activity } from "@/lib/models/Activity";
import { Notification } from "@/lib/models/Notification";
import { DropNotify } from "@/lib/models/DropNotify";
import {
  toActivityView,
  toCollectionDetailView,
  toCollectionView,
  toItemDetailView,
  toItemView,
  toNotificationView,
  toUserRef,
} from "@/lib/viewMappers";
import {
  ActivityView,
  BidView,
  CollectionDetailView,
  CollectionView,
  DropView,
  ItemDetailView,
  ItemView,
  NotificationView,
  ProfileView,
  SearchResults,
} from "@/lib/types";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Admin "hidden" was stored and toggled but never read, so hiding a
// collection did nothing at all. Every public read path now goes through
// one of these: VISIBLE_COLLECTION for collection queries, and
// excludeHidden() for item queries, which have no `hidden` field of their
// own and have to be excluded by parent.
//
// Hiding is deliberately total — the collection page, its items, search,
// rankings, drops and profile holdings all stop showing it. Admin routes
// query the models directly and are unaffected, which is what lets an
// admin find it again to unhide it.
const VISIBLE_COLLECTION = { hidden: { $ne: true } } as const;

async function hiddenCollectionIds(): Promise<Types.ObjectId[]> {
  const docs = await Collection.find({ hidden: true }).select("_id").lean();
  return docs.map((d) => d._id as Types.ObjectId);
}

/** Adds "not in a hidden collection" to an item-side filter, without
 *  clobbering a `collection` constraint the caller already set. */
async function excludeHidden(match: Record<string, unknown>): Promise<Record<string, unknown>> {
  const hidden = await hiddenCollectionIds();
  if (hidden.length === 0) return match;
  const and = [...((match.$and as unknown[]) ?? []), { collection: { $nin: hidden } }];
  return { ...match, $and: and };
}

/** Drops populated items whose parent collection is missing or hidden. */
function visibleItems<T extends { collection?: unknown }>(docs: T[]): T[] {
  return docs.filter((d) => !!d.collection && !(d.collection as { hidden?: boolean }).hidden);
}

export async function getTrendingCollections(limit = 8): Promise<CollectionView[]> {
  await connectDB();
  // Popularity falls back through progressively slower signals. Sorting on
  // 24h volume alone orders a young marketplace arbitrarily, because almost
  // every collection sits at zero — lifetime volume, then holders, then
  // size break those ties with something real.
  const docs = await Collection.find(VISIBLE_COLLECTION)
    .sort({
      "stats.volume24hEth": -1,
      "stats.totalVolumeEth": -1,
      "stats.owners": -1,
      "stats.items": -1,
    })
    .limit(limit)
    .lean();
  return docs.map((d) => toCollectionView(d as never));
}

export async function getLiveAuctions(limit = 8): Promise<ItemView[]> {
  await connectDB();
  const docs = await Item.find(await excludeHidden({ status: "auction" }))
    .sort({ auctionEndsAt: 1 })
    .limit(limit)
    .populate("collection")
    .lean();
  return docs.map((d) => toItemView(d as never));
}

export async function getFeaturedItems(limit = 12): Promise<ItemView[]> {
  await connectDB();
  const docs = await Item.find(await excludeHidden({ status: { $in: ["fixed_price", "auction"] } }))
    .sort({ favoriteCount: -1 })
    .limit(limit)
    .populate("collection")
    .lean();
  return docs.map((d) => toItemView(d as never));
}

// A "top creator" is someone who has actually created NFTs here — a
// follower count on its own describes a collector or a lurker, not a
// creator, so the leaderboard is built from authored items and only then
// ranked by reach.
export async function getTopCreators(limit = 6) {
  await connectDB();
  const hidden = await hiddenCollectionIds();
  const rows = await Item.aggregate([
    {
      $match: {
        creator: { $ne: null },
        ...(hidden.length > 0 ? { collection: { $nin: hidden } } : {}),
      },
    },
    { $group: { _id: "$creator", itemCount: { $sum: 1 } } },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
    { $unwind: "$user" },
    { $sort: { itemCount: -1, "user.followerCount": -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({
    id: String(r._id),
    username: r.user.username,
    isVerified: !!r.user.isVerified,
    verificationTier: (r.user.verificationTier as "none" | "white" | "purple") ?? "none",
    avatarUrl: r.user.avatarUrl ?? "",
    followerCount: r.user.followerCount || 0,
    itemCount: r.itemCount as number,
  }));
}

export async function getPlatformStats() {
  await connectDB();
  const [collectionAgg] = await Collection.aggregate([
    { $match: VISIBLE_COLLECTION },
    {
      $group: {
        _id: null,
        totalVolume: { $sum: "$stats.totalVolumeEth" },
        totalItems: { $sum: "$stats.items" },
        totalOwners: { $sum: "$stats.owners" },
        collections: { $sum: 1 },
      },
    },
  ]);
  // Owners can't be summed across collections — a wallet holding from three
  // collections is one owner, not three. Count distinct holders instead,
  // across both 721 ownership and 1155 balances.
  const [erc721Owners, erc1155Owners] = await Promise.all([
    Item.distinct("owner", { owner: { $ne: null } }),
    ItemBalance.distinct("owner", { quantity: { $gt: 0 } }),
  ]);
  const totalOwners = new Set(
    [...erc721Owners, ...erc1155Owners].map((o) => String(o))
  ).size;

  // Volume comes from settled sales rather than the per-collection running
  // totals, so a collection whose stats haven't been recalculated yet still
  // contributes what it actually traded.
  const [saleAgg] = await Activity.aggregate([
    { $match: { type: "sale", priceEth: { $gt: 0 } } },
    { $group: { _id: null, volume: { $sum: { $multiply: ["$priceEth", { $ifNull: ["$quantity", 1] }] } } } },
  ]);

  return {
    totalVolumeEth: saleAgg?.volume ?? collectionAgg?.totalVolume ?? 0,
    totalItems: collectionAgg?.totalItems ?? 0,
    totalOwners,
    collections: collectionAgg?.collections ?? 0,
  };
}

export interface ExploreFilters {
  category?: string;
  collectionSlug?: string;
  status?: "fixed_price" | "auction" | "sold" | "not_listed";
  sort?: "price_asc" | "price_desc" | "recent" | "favorites" | "ending_soon";
  minPrice?: number;
  maxPrice?: number;
  traits?: Record<string, string[]>; // trait_type -> selected values, collection pages only
  page?: number;
  pageSize?: number;
}

export async function getExploreItems(filters: ExploreFilters) {
  await connectDB();
  const {
    category,
    collectionSlug,
    status,
    sort = "recent",
    minPrice,
    maxPrice,
    traits,
    page = 1,
    pageSize = 24,
  } = filters;

  const match: Record<string, unknown> = {};

  if (collectionSlug) {
    const collection = await Collection.findOne({ slug: collectionSlug, ...VISIBLE_COLLECTION }).select("_id").lean();
    if (!collection) return { items: [], total: 0, page, pageSize, pageCount: 1 };
    match.collection = collection._id;
  } else if (category) {
    const collectionIds = (await Collection.find({ category, ...VISIBLE_COLLECTION }).select("_id").lean()).map(
      (c) => c._id
    );
    match.collection = { $in: collectionIds };
  }

  if (status) match.status = status;
  if (minPrice !== undefined || maxPrice !== undefined) {
    match.priceEth = {};
    if (minPrice !== undefined) (match.priceEth as Record<string, number>).$gte = minPrice;
    if (maxPrice !== undefined) (match.priceEth as Record<string, number>).$lte = maxPrice;
  }
  if (traits) {
    const traitClauses = Object.entries(traits)
      .filter(([, values]) => values.length > 0)
      .map(([traitType, values]) => ({
        traits: { $elemMatch: { trait_type: traitType, value: { $in: values } } },
      }));
    if (traitClauses.length > 0) match.$and = traitClauses;
  }

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    price_asc: { priceEth: 1 },
    price_desc: { priceEth: -1 },
    recent: { createdAt: -1 },
    favorites: { favoriteCount: -1 },
    ending_soon: { auctionEndsAt: 1 },
  };

  const visibleMatch = await excludeHidden(match);

  const [docs, total] = await Promise.all([
    Item.find(visibleMatch)
      .sort(sortMap[sort] ?? sortMap.recent)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate("collection")
      .lean(),
    Item.countDocuments(visibleMatch),
  ]);

  return {
    items: docs.filter((d) => d.collection).map((d) => toItemView(d as never)),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getCategoryCounts() {
  await connectDB();
  const agg = await Collection.aggregate([
    { $match: VISIBLE_COLLECTION },
    { $group: { _id: "$category", items: { $sum: "$stats.items" } } },
  ]);
  const map: Record<string, number> = {};
  for (const a of agg) map[a._id] = a.items;
  return map;
}

export async function getItemById(id: string): Promise<ItemDetailView | null> {
  await connectDB();
  if (!Types.ObjectId.isValid(id)) return null;

  const doc = await Item.findById(id)
    .populate("collection")
    .populate("owner")
    .populate("creator")
    .lean();
  if (!doc || !doc.collection) return null;
  // A hidden collection is hidden all the way down — its items 404 too,
  // otherwise a direct link would still reach them.
  if ((doc.collection as { hidden?: boolean }).hidden) return null;

  // Fire-and-forget — never block the page render on a view-count write.
  Item.updateOne({ _id: id }, { $inc: { viewCount: 1 } }).catch(() => {});

  return toItemDetailView(doc as never);
}

export async function getRelatedItems(
  collectionId: string,
  excludeId: string,
  limit = 8
): Promise<ItemView[]> {
  await connectDB();
  const docs = await Item.find({ collection: collectionId, _id: { $ne: excludeId } })
    .sort({ favoriteCount: -1 })
    .limit(limit)
    .populate("collection")
    .lean();
  return docs.map((d) => toItemView(d as never));
}

export async function getCollectionBySlug(slug: string): Promise<CollectionDetailView | null> {
  await connectDB();
  const doc = await Collection.findOne({ slug, ...VISIBLE_COLLECTION }).populate("creator", "address").lean();
  if (!doc) return null;

  // stats.owners is only ever set at seed time — it never reflects real
  // ownership changes from minting/buying/reselling, so compute it live
  // instead of trusting the stored (and usually stale/zero) value.
  // Counted across both ownership models, then de-duplicated: a wallet
  // holding a 721 and an edition from the same collection is one owner,
  // not two. Grouping over Item alone missed every 1155 holder.
  const [owners721, owners1155] = await Promise.all([
    Item.aggregate([
      { $match: { collection: doc._id, standard: { $ne: "ERC1155" }, owner: { $ne: null } } },
      { $group: { _id: "$owner" } },
    ]),
    ItemBalance.aggregate([
      { $lookup: { from: "items", localField: "item", foreignField: "_id", as: "item" } },
      { $unwind: "$item" },
      { $match: { "item.collection": doc._id, quantity: { $gt: 0 } } },
      { $group: { _id: "$owner" } },
    ]),
  ]);
  const ownerIds = new Set([...owners721, ...owners1155].map((o) => String(o._id)));
  doc.stats.owners = ownerIds.size;
  doc.stats.items = await Item.countDocuments({ collection: doc._id });
  // Units actually minted on-chain, as opposed to stats.items (every Item
  // doc, including unminted lazy vouchers pre-created for a drop). Counted
  // in units because an ERC-1155 row is an edition of many — this is what
  // "minted out" means for gating the secondary market.
  const { mintedUnits, totalUnits } = await collectionMintProgress(doc._id);

  // "Top offer" is the best standing collection-wide bid — the number a
  // holder could accept right now without listing. Expired offers are
  // excluded even if a sweeper hasn't marked them yet.
  const now = new Date();
  const topOffer = await CollectionOffer.findOne({
    collection: doc._id,
    status: "active",
    $or: [{ deadline: null }, { deadline: { $gt: now } }],
  })
    .sort({ pricePerItemEth: -1 })
    .select("pricePerItemEth")
    .lean();

  return toCollectionDetailView({ ...doc, topOfferEth: topOffer?.pricePerItemEth ?? null, mintedSupply: mintedUnits, totalUnits } as never);
}

export async function getCollectionTraitFacets(collectionId: string) {
  await connectDB();
  const agg = await Item.aggregate([
    { $match: { collection: new Types.ObjectId(collectionId) } },
    { $unwind: "$traits" },
    {
      $group: {
        _id: { trait_type: "$traits.trait_type", value: "$traits.value" },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  const facets: Record<string, { value: string; count: number }[]> = {};
  for (const a of agg) {
    const traitType: string = a._id.trait_type;
    if (!facets[traitType]) facets[traitType] = [];
    facets[traitType].push({ value: a._id.value, count: a.count });
  }
  return facets;
}

export async function getProfileByAddress(address: string): Promise<ProfileView | null> {
  await connectDB();
  const doc = await User.findOne({ address: address.toLowerCase() }).lean();
  if (!doc) return null;
  return {
    id: String(doc._id),
    address: doc.address,
    username: doc.username,
    bio: doc.bio || "",
    isVerified: !!doc.isVerified,
    verificationTier: (doc.verificationTier as ProfileView["verificationTier"]) ?? "none",
    avatarUrl: doc.avatarUrl || "",
    bannerUrl: doc.bannerUrl || "",
    socials: {
      twitter: doc.socials?.twitter || "",
      discord: doc.socials?.discord || "",
      website: doc.socials?.website || "",
      instagram: doc.socials?.instagram || "",
    },
    followerCount: doc.followerCount || 0,
    followingCount: doc.followingCount || 0,
    joinedAt: new Date(doc.createdAt as Date).toISOString(),
  };
}

export async function getItemsByOwner(userId: string): Promise<ItemView[]> {
  await connectDB();

  // Ownership is recorded two different ways. An ERC-721 has a single
  // owner on the Item itself; an ERC-1155 is held by many wallets at once,
  // so its holdings live in ItemBalance and the Item's own `owner` field
  // still points at whoever created it. Reading only Item.owner therefore
  // showed 1155 buyers nothing they had bought, while wrongly listing the
  // creator as owning editions they had already sold.
  const balances = await ItemBalance.find({ owner: userId, quantity: { $gt: 0 } })
    .select("item")
    .lean();
  const heldEditionIds = balances.map((b) => b.item);

  const docs = await Item.find({
    $or: [
      { owner: userId, standard: { $ne: "ERC1155" } },
      { _id: { $in: heldEditionIds } },
    ],
  })
    .sort({ createdAt: -1 })
    .populate("collection")
    .lean();
  return visibleItems(docs).map((d) => toItemView(d as never));
}

export async function getItemsByCreator(userId: string): Promise<ItemView[]> {
  await connectDB();
  const docs = await Item.find({ creator: userId })
    .sort({ createdAt: -1 })
    .populate("collection")
    .lean();
  return visibleItems(docs).map((d) => toItemView(d as never));
}

export async function getFavoritedItems(userId: string): Promise<ItemView[]> {
  await connectDB();
  const favorites = await Favorite.find({ user: userId }).sort({ createdAt: -1 }).lean();
  const itemIds = favorites.map((f) => f.item);
  const docs = await Item.find({ _id: { $in: itemIds } }).populate("collection").lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return itemIds
    .map((id) => byId.get(String(id)))
    .filter((d): d is NonNullable<typeof d> => !!d && !!d.collection && !(d.collection as { hidden?: boolean }).hidden)
    .map((d) => toItemView(d as never));
}

export interface CreatorAnalytics {
  collections: number;
  items: number;
  listed: number;
  minted: number;
  views: number;
  favorites: number;
  totalVolumeEth: number;
  sales: number;
  volumeLast30DaysEth: number;
  collectionPerformance: {
    id: string;
    name: string;
    slug: string;
    items: number;
    owners: number;
    floorEth: number;
    totalVolumeEth: number;
    sales: number;
  }[];
}

/** Marketplace analytics calculated from the authenticated creator's own data. */
export async function getCreatorAnalytics(userId: string): Promise<CreatorAnalytics> {
  await connectDB();
  const creatorId = new Types.ObjectId(userId);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [collections, itemAgg, salesAgg] = await Promise.all([
    Collection.find({ creator: creatorId }).sort({ createdAt: -1 }).lean(),
    Item.aggregate([
      { $match: { creator: creatorId } },
      {
        $group: {
          _id: null,
          items: { $sum: 1 },
          listed: { $sum: { $cond: [{ $in: ["$status", ["fixed_price", "auction"]] }, 1, 0] } },
          minted: { $sum: { $cond: ["$isMinted", 1, 0] } },
          views: { $sum: "$viewCount" },
          favorites: { $sum: "$favoriteCount" },
        },
      },
    ]),
    Activity.aggregate([
      { $match: { type: "sale", createdAt: { $gte: thirtyDaysAgo } } },
      { $lookup: { from: "items", localField: "item", foreignField: "_id", as: "itemDoc" } },
      { $unwind: "$itemDoc" },
      { $match: { "itemDoc.creator": creatorId } },
      { $group: { _id: null, volume: { $sum: { $ifNull: ["$priceEth", 0] } } } },
    ]),
  ]);
  const totals = itemAgg[0] ?? {};
  return {
    collections: collections.length,
    items: totals.items ?? 0,
    listed: totals.listed ?? 0,
    minted: totals.minted ?? 0,
    views: totals.views ?? 0,
    favorites: totals.favorites ?? 0,
    totalVolumeEth: collections.reduce((sum, c) => sum + (c.stats?.totalVolumeEth ?? 0), 0),
    sales: collections.reduce((sum, c) => sum + (c.stats?.sales ?? 0), 0),
    volumeLast30DaysEth: salesAgg[0]?.volume ?? 0,
    collectionPerformance: collections.map((c) => ({
      id: String(c._id), name: c.name, slug: c.slug,
      items: c.stats?.items ?? 0, owners: c.stats?.owners ?? 0,
      floorEth: c.stats?.floorEth ?? 0, totalVolumeEth: c.stats?.totalVolumeEth ?? 0,
      sales: c.stats?.sales ?? 0,
    })),
  };
}

export type RankingsTimeframe = "24h" | "7d" | "all";

const RANKINGS_SORT_FIELD: Record<RankingsTimeframe, string> = {
  "24h": "stats.volume24hEth",
  "7d": "stats.volume7dEth",
  all: "stats.totalVolumeEth",
};

export async function getRankedCollections(
  timeframe: RankingsTimeframe,
  limit = 50
): Promise<CollectionDetailView[]> {
  await connectDB();
  const docs = await Collection.find(VISIBLE_COLLECTION)
    .sort({ [RANKINGS_SORT_FIELD[timeframe]]: -1 })
    .limit(limit)
    .lean();
  return docs.map((d) => toCollectionDetailView(d as never));
}

export async function getItemOffers(itemId: string): Promise<BidView[]> {
  await connectDB();
  const docs = await Bid.find({ item: itemId, status: { $ne: "cancelled" } })
    .sort({ amountEth: -1, createdAt: -1 })
    .populate("bidder")
    .lean();

  return docs
    .filter((d) => d.bidder)
    .map((d) => ({
      id: String(d._id),
      type: d.type,
      amountEth: d.amountEth,
      status: d.status,
      bidder: toUserRef(d.bidder as never)!,
      createdAt: new Date(d.createdAt as Date).toISOString(),
      expiresAt: d.expiresAt ? new Date(d.expiresAt as Date).toISOString() : null,
    }));
}

export type ActivityType = "sale" | "list" | "bid" | "offer" | "mint" | "transfer" | "cancel";

export interface ActivityFilters {
  type?: ActivityType;
  itemId?: string;
  /** Everything a wallet took part in, whether it was the sender or receiver. */
  userId?: string;
  collectionId?: string;
  page?: number;
  pageSize?: number;
}

export async function getActivity(filters: ActivityFilters) {
  await connectDB();
  const { type, itemId, userId, collectionId, page = 1, pageSize = 30 } = filters;

  const match: Record<string, unknown> = {};
  if (type) match.type = type;
  if (itemId) match.item = itemId;
  if (userId) match.$or = [{ from: userId }, { to: userId }];
  if (collectionId) {
    const ids = await Item.find({ collection: collectionId }).select("_id").lean();
    match.item = { $in: ids.map((doc) => doc._id) };
  }

  // Activity carries no collection of its own, so hidden ones are excluded
  // through the items that belong to them.
  const hiddenIds = await hiddenCollectionIds();
  if (hiddenIds.length > 0) {
    const hiddenItems = await Item.find({ collection: { $in: hiddenIds } }).select("_id").lean();
    if (hiddenItems.length > 0) {
      match.$and = [
        ...((match.$and as unknown[]) ?? []),
        { item: { $nin: hiddenItems.map((d) => d._id) } },
      ];
    }
  }

  const [docs, total] = await Promise.all([
    Activity.find(match)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate({ path: "item", populate: { path: "collection" } })
      .populate("from")
      .populate("to")
      .lean(),
    Activity.countDocuments(match),
  ]);

  return {
    activity: docs
      .map((d) => toActivityView(d as never))
      .filter((a): a is ActivityView => a !== null),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getNotifications(
  userId: string,
  limit = 30
): Promise<{ notifications: NotificationView[]; unreadCount: number }> {
  await connectDB();
  const [docs, unreadCount] = await Promise.all([
    Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({ path: "item", populate: { path: "collection" } })
      .populate("fromUser")
      .lean(),
    Notification.countDocuments({ user: userId, read: false }),
  ]);

  return {
    notifications: docs.map((d) => toNotificationView(d as never)),
    unreadCount,
  };
}

export async function search(query: string, limit = 8): Promise<SearchResults> {
  const trimmed = query.trim();
  if (!trimmed) return { items: [], collections: [], users: [] };

  await connectDB();
  const re = new RegExp(escapeRegExp(trimmed), "i");

  const [itemDocs, collectionDocs, userDocs] = await Promise.all([
    excludeHidden({ name: re }).then((m) => Item.find(m).limit(limit).populate("collection").lean()),
    Collection.find({ name: re, ...VISIBLE_COLLECTION }).limit(limit).lean(),
    User.find({ username: re }).limit(limit).lean(),
  ]);

  return {
    items: itemDocs.filter((d) => d.collection).map((d) => toItemView(d as never)),
    collections: collectionDocs.map((d) => toCollectionView(d as never)),
    users: userDocs.map((d) => toUserRef(d as never)!),
  };
}

/** The single collection whose scheduled drop window is live right now, for the header banner — null if none. */
export async function getActiveLiveDrop(): Promise<{ slug: string; name: string } | null> {
  await connectDB();
  const now = new Date();
  const doc = await Collection.findOne({ dropStartsAt: { $lte: now }, dropEndsAt: { $gt: now }, ...VISIBLE_COLLECTION })
    .sort({ dropStartsAt: -1 })
    .select("slug name")
    .lean();
  return doc ? { slug: doc.slug as string, name: doc.name as string } : null;
}

export async function getDrops(viewerUserId?: string): Promise<DropView[]> {
  await connectDB();
  const docs = await Collection.find({ dropStartsAt: { $ne: null }, ...VISIBLE_COLLECTION })
    .sort({ dropStartsAt: 1 })
    .lean();
  if (docs.length === 0) return [];

  const collectionIds = docs.map((d) => d._id);
  const [counts, mine] = await Promise.all([
    DropNotify.aggregate([
      { $match: { collection: { $in: collectionIds } } },
      { $group: { _id: "$collection", count: { $sum: 1 } } },
    ]),
    viewerUserId
      ? DropNotify.find({ user: viewerUserId, collection: { $in: collectionIds } }).lean()
      : Promise.resolve([]),
  ]);

  const countMap = new Map(counts.map((c) => [String(c._id), c.count as number]));
  const mineSet = new Set(mine.map((m) => String(m.collection)));
  const now = Date.now();

  return docs.map((d) => ({
    ...toCollectionView(d as never),
    dropStartsAt: new Date(d.dropStartsAt as Date).toISOString(),
    dropEndsAt: new Date(d.dropEndsAt as Date).toISOString(),
    notifyCount: countMap.get(String(d._id)) ?? 0,
    isNotifying: mineSet.has(String(d._id)),
    isLive: new Date(d.dropStartsAt as Date).getTime() <= now,
  }));
}
