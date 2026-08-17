import { CategoryKey } from "@/components/ui/CategoryIcon";
import {
  ActivityView,
  CollectionDetailView,
  CollectionView,
  ItemDetailView,
  ItemView,
  NotificationView,
  UserRef,
} from "@/lib/types";

// Loose input types: only the fields we read, works for both lean() Mongoose
// docs and plain seed objects.
interface CollectionLike {
  _id: unknown;
  slug: string;
  name: string;
  category: string;
  logoUrl?: string;
  bannerUrl?: string;
  verified: boolean;
  stats: {
    floorEth: number;
    volume24hEth: number;
    volumeChangePct: number;
    items: number;
    owners: number;
  };
}

interface ItemLike {
  _id: unknown;
  name: string;
  status: string;
  isMinted: boolean;
  priceEth: number;
  lastSalePriceEth?: number | null;
  highestBidEth: number;
  auctionEndsAt: Date | string | null;
  favoriteCount: number;
  createdAt: Date | string;
  mediaUrl?: string;
  mediaType?: string;
  mediaName?: string;
  collection: CollectionLike;
}

interface CollectionDetailLike extends CollectionLike {
  description: string;
  contractAddress: string;
  chainId: number;
  standard: string;
  royaltyBps: number;
  contractType?: "lazy" | "drop";
  maxSupply?: number;
  creator?: { address?: string } | null;
  mintPhases?: {
    whitelist?: { enabled?: boolean; priceEth?: number; allocation?: number; walletLimit?: number; startsAt?: Date | string | null; endsAt?: Date | string | null };
    og?: { enabled?: boolean; priceEth?: number; allocation?: number; walletLimit?: number; startsAt?: Date | string | null; endsAt?: Date | string | null };
    public?: { enabled?: boolean; priceEth?: number; allocation?: number; walletLimit?: number; startsAt?: Date | string | null; endsAt?: Date | string | null };
  };
  stats: CollectionLike["stats"] & { volume7dEth: number; totalVolumeEth: number; sales: number };
}

interface UserLike {
  address: string;
  username: string;
  isVerified?: boolean;
}

interface ItemDetailLike extends ItemLike {
  description: string;
  tokenId: string | null;
  metadataUri: string;
  viewCount: number;
  traits: { trait_type: string; value: string; rarity?: number }[];
  owner: UserLike | null;
  creator: UserLike | null;
  collection: CollectionLike & { contractAddress: string; chainId: number };
  voucher?: {
    tokenId?: string | null;
    uri?: string | null;
    minPrice?: string | null;
    creator?: string | null;
    royaltyBps?: number | null;
    signature?: string | null;
    nonce?: number | null;
    deadline?: string | null;
  } | null;
  listing?: {
    nft?: string | null;
    tokenId?: string | null;
    seller?: string | null;
    buyer?: string | null;
    price?: string | null;
    deadline?: string | null;
    nonce?: string | null;
    signature?: string | null;
  } | null;
}

const ETH_USD = 3400;

export function toUserRef(u: UserLike | null | undefined): UserRef | null {
  if (!u) return null;
  return { address: u.address, username: u.username, isVerified: !!u.isVerified };
}

export function toCollectionView(c: CollectionLike): CollectionView {
  return {
    id: String(c._id),
    slug: c.slug,
    name: c.name,
    logoUrl: c.logoUrl || "",
    bannerUrl: c.bannerUrl || "",
    category: c.category as CategoryKey,
    verified: c.verified,
    floorEth: c.stats.floorEth,
    volume24hEth: c.stats.volume24hEth,
    volumeChangePct: c.stats.volumeChangePct,
    items: c.stats.items,
    owners: c.stats.owners,
  };
}

export function toItemView(item: ItemLike): ItemView {
  return {
    id: String(item._id),
    name: item.name,
    imageUrl: item.mediaUrl || "",
    mediaUrl: item.mediaUrl || undefined,
    mediaType: item.mediaType || undefined,
    collectionName: item.collection.name,
    collectionSlug: item.collection.slug,
    collectionVerified: item.collection.verified,
    category: item.collection.category as CategoryKey,
    priceEth: item.priceEth,
    priceUsd: item.priceEth * ETH_USD,
    lastSalePriceEth: item.lastSalePriceEth ?? null,
    isMinted: item.isMinted,
    status: item.status as ItemView["status"],
    favoriteCount: item.favoriteCount,
    highestBidEth: item.highestBidEth || undefined,
    auctionEndsAt: item.auctionEndsAt ? new Date(item.auctionEndsAt).toISOString() : undefined,
    listedAt: new Date(item.createdAt).toISOString(),
  };
}

export function toCollectionDetailView(c: CollectionDetailLike): CollectionDetailView {
  const phase = (
    value:
      | { enabled?: boolean; priceEth?: number; allocation?: number; walletLimit?: number; startsAt?: Date | string | null; endsAt?: Date | string | null }
      | undefined
  ) => ({
    enabled: !!value?.enabled,
    priceEth: value?.priceEth ?? 0,
    allocation: value?.allocation ?? 0,
    walletLimit: value?.walletLimit ?? 0,
    startsAt: value?.startsAt ? new Date(value.startsAt).toISOString() : null,
    endsAt: value?.endsAt ? new Date(value.endsAt).toISOString() : null,
  });
  return {
    ...toCollectionView(c),
    creatorAddress: c.creator?.address ?? null,
    description: c.description,
    contractAddress: c.contractAddress,
    chainId: c.chainId,
    standard: c.standard,
    royaltyBps: c.royaltyBps,
    volume7dEth: c.stats.volume7dEth,
    totalVolumeEth: c.stats.totalVolumeEth,
    sales: c.stats.sales,
    contractType: c.contractType ?? "lazy",
    maxSupply: c.maxSupply ?? 0,
    mintPhases: {
      whitelist: phase(c.mintPhases?.whitelist),
      og: phase(c.mintPhases?.og),
      public: phase(c.mintPhases?.public),
    },
  };
}

export function toItemDetailView(item: ItemDetailLike): ItemDetailView {
  return {
    ...toItemView(item),
    collectionId: String(item.collection._id),
    description: item.description,
    tokenId: item.tokenId,
    metadataUri: item.metadataUri,
    mediaUrl: item.mediaUrl || undefined,
    mediaType: item.mediaType || undefined,
    mediaName: item.mediaName || undefined,
    chainId: item.collection.chainId,
    contractAddress: item.collection.contractAddress,
    viewCount: item.viewCount,
    traits: (item.traits ?? []).map((t) => ({
      traitType: t.trait_type,
      value: t.value,
      rarity: t.rarity ?? 0,
    })),
    owner: toUserRef(item.owner),
    creator: toUserRef(item.creator),
    voucher:
      item.voucher &&
      item.voucher.tokenId &&
      item.voucher.uri &&
      item.voucher.minPrice &&
      item.voucher.creator &&
      item.voucher.signature
        ? {
            tokenId: item.voucher.tokenId,
            uri: item.voucher.uri,
            minPrice: item.voucher.minPrice,
            creator: item.voucher.creator,
            royaltyBps: item.voucher.royaltyBps ?? 0,
            nonce: item.voucher.nonce ?? 0,
            signature: item.voucher.signature,
            deadline: item.voucher.deadline ?? "0",
          }
        : null,
    listing:
      item.listing &&
      item.listing.nft &&
      item.listing.tokenId &&
      item.listing.seller &&
      item.listing.price &&
      item.listing.signature
        ? {
            nft: item.listing.nft,
            tokenId: item.listing.tokenId,
            seller: item.listing.seller,
            buyer: item.listing.buyer ?? null,
            price: item.listing.price,
            deadline: item.listing.deadline ?? "0",
            nonce: item.listing.nonce ?? "0",
            signature: item.listing.signature,
          }
        : null,
  };
}

interface ActivityLike {
  _id: unknown;
  type: string;
  priceEth: number | null;
  createdAt: Date | string;
  from: UserLike | null;
  to: UserLike | null;
  item: { _id: unknown; name: string; collection: CollectionLike } | null;
}

export function toActivityView(a: ActivityLike): ActivityView | null {
  if (!a.item || !a.item.collection) return null;
  return {
    id: String(a._id),
    type: a.type as ActivityView["type"],
    itemId: String(a.item._id),
    itemName: a.item.name,
    collectionName: a.item.collection.name,
    collectionSlug: a.item.collection.slug,
    from: toUserRef(a.from),
    to: toUserRef(a.to),
    priceEth: a.priceEth,
    createdAt: new Date(a.createdAt).toISOString(),
  };
}

interface NotificationLike {
  _id: unknown;
  type: string;
  amountEth: number | null;
  read: boolean;
  createdAt: Date | string;
  fromUser: UserLike | null;
  item: { _id: unknown; name: string; collection: { slug: string } } | null;
}

export function toNotificationView(n: NotificationLike): NotificationView {
  return {
    id: String(n._id),
    type: n.type as NotificationView["type"],
    itemId: n.item ? String(n.item._id) : null,
    itemName: n.item?.name ?? null,
    collectionSlug: n.item?.collection?.slug ?? null,
    fromUser: toUserRef(n.fromUser),
    amountEth: n.amountEth,
    read: n.read,
    createdAt: new Date(n.createdAt).toISOString(),
  };
}
