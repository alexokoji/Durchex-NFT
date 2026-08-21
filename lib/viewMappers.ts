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
import { VerificationTier } from "@/lib/verification";
import { isItemMintedOut, isMintedOut, itemMintRemaining, listingGate, mintRemaining } from "@/lib/listing";

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
  creator?: { verificationTier?: string } | null;
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
  standard?: string;
  priceEth: number;
  lastSalePriceEth?: number | null;
  floorEth?: number | null;
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
  creator?: { address?: string; verificationTier?: string } | null;
  mintPhases?: {
    whitelist?: { enabled?: boolean; priceEth?: number; allocation?: number; walletLimit?: number; startsAt?: Date | string | null; endsAt?: Date | string | null };
    og?: { enabled?: boolean; priceEth?: number; allocation?: number; walletLimit?: number; startsAt?: Date | string | null; endsAt?: Date | string | null };
    public?: { enabled?: boolean; priceEth?: number; allocation?: number; walletLimit?: number; startsAt?: Date | string | null; endsAt?: Date | string | null };
  };
  links?: { website?: string; twitter?: string; discord?: string };
  createdAt?: Date | string;
  /** Highest live collection offer, resolved by the query layer. */
  topOfferEth?: number | null;
  /** Items actually minted on-chain so far, resolved by the query layer. */
  mintedSupply?: number;
  /** Units minted across the collection, from the query layer. */
  totalUnits?: number;
  listingEnabled?: boolean;
  exclusivePhaseLive?: boolean;
  publicPhaseLive?: boolean;
  stats: CollectionLike["stats"] & {
    floorHistory?: { at: Date | string; floorEth: number }[];
    volume7dEth: number;
    totalVolumeEth: number;
    sales: number;
    floorEth24hAgo?: number;
  };
}

interface UserLike {
  address: string;
  username: string;
  isVerified?: boolean;
  verificationTier?: string;
  avatarUrl?: string;
}

type PhaseLike = {
  enabled?: boolean;
  priceEth?: number;
  allocation?: number;
  walletLimit?: number;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
};

interface ItemDetailLike extends ItemLike {
  description: string;
  tokenId: string | null;
  metadataUri: string;
  viewCount: number;
  traits: { trait_type: string; value: string; rarity?: number }[];
  owner: UserLike | null;
  creator: UserLike | null;
  collection: CollectionLike & {
    contractAddress: string;
    chainId: number;
    royaltyBps?: number;
    maxSupply?: number;
    /** Whether the parent collection's secondary market is open at all,
     *  resolved by the query layer. */
    resaleOpen?: boolean;
    contractType?: "lazy" | "drop";
    mintPhases?: {
      whitelist?: PhaseLike;
      og?: PhaseLike;
      public?: PhaseLike;
    };
  };
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
  totalSupply?: number;
  mintedSupply?: number;
  ownersCount?: number;
  itemFloorEth?: number | null;
  bestOfferEth?: number | null;
  editionVoucher?: {
    tokenId?: string | null;
    uri?: string | null;
    minPrice?: string | null;
    creator?: string | null;
    royaltyBps?: number | null;
    maxSupply?: number | null;
    nonce?: string | null;
    signature?: string | null;
    deadline?: string | null;
  } | null;
}

const ETH_USD = 3400;

// Mint-out is measured in units, never in item rows — an ERC-1155 row is
// an edition of many. See lib/collectionSupply.ts.
function floorChange1d(c: CollectionDetailLike): number | null {
  const history = c.stats?.floorHistory ?? [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  // The newest observation that is at least a day old; anything younger
  // would describe a shorter window while claiming to describe a day.
  const baseline = [...history]
    .map((h) => ({ at: new Date(h.at).getTime(), floorEth: h.floorEth }))
    .filter((h) => h.at <= cutoff)
    .sort((a, b) => b.at - a.at)[0];
  if (!baseline || baseline.floorEth <= 0) return null;
  return ((c.stats.floorEth - baseline.floorEth) / baseline.floorEth) * 100;
}

function supplyOf(c: CollectionDetailLike) {
  return {
    maxSupply: c.maxSupply ?? 0,
    mintedUnits: c.mintedSupply ?? 0,
    totalUnits: c.totalUnits ?? 0,
  };
}

export function toUserRef(u: UserLike | null | undefined): UserRef | null {
  if (!u) return null;
  return {
    address: u.address,
    username: u.username,
    isVerified: !!u.isVerified,
    verificationTier: (u.verificationTier as UserRef["verificationTier"]) ?? "none",
    avatarUrl: u.avatarUrl ?? "",
  };
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
    creatorTier: (c.creator?.verificationTier as VerificationTier) ?? "none",
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
    creatorTier: (item.collection.creator?.verificationTier as VerificationTier) ?? "none",
    category: item.collection.category as CategoryKey,
    priceEth: item.priceEth,
    priceUsd: item.priceEth * ETH_USD,
    lastSalePriceEth: item.lastSalePriceEth ?? null,
    floorEth: item.floorEth ?? null,
    isMinted: item.isMinted,
    status: item.status as ItemView["status"],
    standard: (item.standard as ItemView["standard"]) ?? "ERC721",
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
    mintedSupply: c.mintedSupply ?? 0,
    totalUnits: c.totalUnits ?? 0,
    resaleOpen: listingGate({
      ...supplyOf(c),
      listingEnabled: c.listingEnabled,
      exclusivePhaseLive: c.exclusivePhaseLive,
      publicPhaseLive: c.publicPhaseLive,
    }).open,
    mintedOut: isMintedOut(supplyOf(c)),
    exclusiveWindow: !!c.exclusivePhaseLive && !c.publicPhaseLive,
    listingEnabled: !!c.listingEnabled,
    mintRemaining: mintRemaining(supplyOf(c)),
    // Only a real baseline gives a meaningful percentage: a collection whose
    // floor was 0 yesterday (nothing listed) has no move to express.
    // Measured against what the floor genuinely was ~24h ago, from the
    // stored series. Null when the collection has no observation that old
    // yet — "—" is honest where a number invented from a shorter window
    // is not.
    floorChange1dPct: floorChange1d(c),
    topOfferEth: c.topOfferEth ?? null,
    links: {
      website: c.links?.website ?? "",
      twitter: c.links?.twitter ?? "",
      discord: c.links?.discord ?? "",
    },
    createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
    mintPhases: {
      whitelist: phase(c.mintPhases?.whitelist),
      og: phase(c.mintPhases?.og),
      public: phase(c.mintPhases?.public),
    },
  };
}

function itemPhase(value: PhaseLike | undefined) {
  return {
    enabled: !!value?.enabled,
    priceEth: value?.priceEth ?? 0,
    allocation: value?.allocation ?? 0,
    walletLimit: value?.walletLimit ?? 0,
    startsAt: value?.startsAt ? new Date(value.startsAt).toISOString() : null,
    endsAt: value?.endsAt ? new Date(value.endsAt).toISOString() : null,
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
    // Default open: collections predating this field have it undefined,
    // and those have always permitted resale listing.
    collectionResaleOpen: !!item.collection.resaleOpen,
    ownersCount: item.ownersCount ?? 0,
    itemFloorEth: item.itemFloorEth ?? null,
    bestOfferEth: item.bestOfferEth ?? null,
    resaleOpen: isItemMintedOut({
      standard: item.standard ?? "ERC721",
      isMinted: item.isMinted,
      totalSupply: item.totalSupply,
      mintedSupply: item.mintedSupply,
    }),
    mintRemaining: itemMintRemaining({
      standard: item.standard ?? "ERC721",
      isMinted: item.isMinted,
      totalSupply: item.totalSupply,
      mintedSupply: item.mintedSupply,
    }),
    viewCount: item.viewCount,
    traits: (item.traits ?? []).map((t) => ({
      traitType: t.trait_type,
      value: t.value,
      rarity: t.rarity ?? 0,
    })),
    owner: toUserRef(item.owner),
    creator: toUserRef(item.creator),
    mintPhases: {
      whitelist: itemPhase(item.collection.mintPhases?.whitelist),
      og: itemPhase(item.collection.mintPhases?.og),
      public: itemPhase(item.collection.mintPhases?.public),
    },
    collectionMaxSupply: item.collection.maxSupply ?? 0,
    royaltyBps: item.collection.royaltyBps ?? 0,
    contractType: item.collection.contractType ?? "lazy",
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
    totalSupply: item.totalSupply ?? 0,
    mintedSupply: item.mintedSupply ?? 0,
    editionVoucher:
      item.editionVoucher &&
      item.editionVoucher.tokenId &&
      item.editionVoucher.uri &&
      item.editionVoucher.minPrice &&
      item.editionVoucher.creator &&
      item.editionVoucher.signature
        ? {
            tokenId: item.editionVoucher.tokenId,
            uri: item.editionVoucher.uri,
            minPrice: item.editionVoucher.minPrice,
            creator: item.editionVoucher.creator,
            royaltyBps: item.editionVoucher.royaltyBps ?? 0,
            maxSupply: item.editionVoucher.maxSupply ?? 0,
            nonce: item.editionVoucher.nonce ?? "0",
            signature: item.editionVoucher.signature,
            deadline: item.editionVoucher.deadline ?? "0",
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
