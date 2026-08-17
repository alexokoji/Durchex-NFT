import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models/Collection";
import { Item } from "@/lib/models/Item";
import { User } from "@/lib/models/User";
import { Favorite } from "@/lib/models/Favorite";
import { Bid } from "@/lib/models/Bid";
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

export async function getTrendingCollections(limit = 8): Promise<CollectionView[]> {
  await connectDB();
  const docs = await Collection.find().sort({ "stats.volume24hEth": -1 }).limit(limit).lean();
  return docs.map((d) => toCollectionView(d as never));
}

export async function getLiveAuctions(limit = 8): Promise<ItemView[]> {
  await connectDB();
  const docs = await Item.find({ status: "auction" })
    .sort({ auctionEndsAt: 1 })
    .limit(limit)
    .populate("collection")
    .lean();
  return docs.map((d) => toItemView(d as never));
}

export async function getFeaturedItems(limit = 12): Promise<ItemView[]> {
  await connectDB();
  const docs = await Item.find({ status: { $in: ["fixed_price", "auction"] } })
    .sort({ favoriteCount: -1 })
    .limit(limit)
    .populate("collection")
    .lean();
  return docs.map((d) => toItemView(d as never));
}

export async function getTopCreators(limit = 6) {
  await connectDB();
  const docs = await User.find().sort({ followerCount: -1 }).limit(limit).lean();
  return docs.map((u) => ({
    id: String(u._id),
    username: u.username,
    isVerified: !!u.isVerified,
    followerCount: u.followerCount || 0,
  }));
}

export async function getPlatformStats() {
  await connectDB();
  const [collectionAgg] = await Collection.aggregate([
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
  return {
    totalVolumeEth: collectionAgg?.totalVolume ?? 0,
    totalItems: collectionAgg?.totalItems ?? 0,
    totalOwners: collectionAgg?.totalOwners ?? 0,
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
    const collection = await Collection.findOne({ slug: collectionSlug }).select("_id").lean();
    if (!collection) return { items: [], total: 0, page, pageSize, pageCount: 1 };
    match.collection = collection._id;
  } else if (category) {
    const collectionIds = (await Collection.find({ category }).select("_id").lean()).map(
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

  const [docs, total] = await Promise.all([
    Item.find(match)
      .sort(sortMap[sort] ?? sortMap.recent)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate("collection")
      .lean(),
    Item.countDocuments(match),
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
  const doc = await Collection.findOne({ slug }).populate("creator", "address").lean();
  if (!doc) return null;

  // stats.owners is only ever set at seed time — it never reflects real
  // ownership changes from minting/buying/reselling, so compute it live
  // instead of trusting the stored (and usually stale/zero) value.
  const ownersAgg = await Item.aggregate([
    { $match: { collection: doc._id } },
    { $group: { _id: "$owner" } },
    { $count: "count" },
  ]);
  doc.stats.owners = ownersAgg[0]?.count ?? 0;
  doc.stats.items = await Item.countDocuments({ collection: doc._id });

  return toCollectionDetailView(doc as never);
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
    followerCount: doc.followerCount || 0,
    followingCount: doc.followingCount || 0,
    joinedAt: new Date(doc.createdAt as Date).toISOString(),
  };
}

export async function getItemsByOwner(userId: string): Promise<ItemView[]> {
  await connectDB();
  const docs = await Item.find({ owner: userId }).sort({ createdAt: -1 }).populate("collection").lean();
  return docs.filter((d) => d.collection).map((d) => toItemView(d as never));
}

export async function getItemsByCreator(userId: string): Promise<ItemView[]> {
  await connectDB();
  const docs = await Item.find({ creator: userId })
    .sort({ createdAt: -1 })
    .populate("collection")
    .lean();
  return docs.filter((d) => d.collection).map((d) => toItemView(d as never));
}

export async function getFavoritedItems(userId: string): Promise<ItemView[]> {
  await connectDB();
  const favorites = await Favorite.find({ user: userId }).sort({ createdAt: -1 }).lean();
  const itemIds = favorites.map((f) => f.item);
  const docs = await Item.find({ _id: { $in: itemIds } }).populate("collection").lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return itemIds
    .map((id) => byId.get(String(id)))
    .filter((d): d is NonNullable<typeof d> => !!d && !!d.collection)
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
  const docs = await Collection.find()
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
  page?: number;
  pageSize?: number;
}

export async function getActivity(filters: ActivityFilters) {
  await connectDB();
  const { type, itemId, page = 1, pageSize = 30 } = filters;

  const match: Record<string, unknown> = {};
  if (type) match.type = type;
  if (itemId) match.item = itemId;

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
    Item.find({ name: re }).limit(limit).populate("collection").lean(),
    Collection.find({ name: re }).limit(limit).lean(),
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
  const doc = await Collection.findOne({ dropStartsAt: { $lte: now }, dropEndsAt: { $gt: now } })
    .sort({ dropStartsAt: -1 })
    .select("slug name")
    .lean();
  return doc ? { slug: doc.slug as string, name: doc.name as string } : null;
}

export async function getDrops(viewerUserId?: string): Promise<DropView[]> {
  await connectDB();
  const docs = await Collection.find({ dropStartsAt: { $ne: null } })
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
