import { CategoryKey } from "@/components/ui/CategoryIcon";

export interface ItemView {
  id: string;
  name: string;
  imageUrl: string;
  mediaUrl?: string;
  mediaType?: string;
  collectionName: string;
  collectionSlug: string;
  collectionVerified: boolean;
  category: CategoryKey;
  priceEth: number;
  priceUsd: number;
  // What this item last actually sold for, distinct from priceEth (the
  // current listing ask, 0 when not listed). Null until a sale settles.
  lastSalePriceEth: number | null;
  isMinted: boolean;
  status: "fixed_price" | "auction" | "sold" | "not_listed";
  favoriteCount: number;
  highestBidEth?: number;
  auctionEndsAt?: string; // ISO date
  listedAt: string; // ISO date
}

export interface CollectionView {
  id: string;
  slug: string;
  name: string;
  logoUrl: string;
  bannerUrl: string;
  category: CategoryKey;
  verified: boolean;
  floorEth: number;
  volume24hEth: number;
  volumeChangePct: number;
  items: number;
  owners: number;
}

export interface CollectionDetailView extends CollectionView {
  creatorAddress: string | null;
  description: string;
  contractAddress: string;
  chainId: number;
  standard: string;
  royaltyBps: number;
  volume7dEth: number;
  totalVolumeEth: number;
  sales: number;
  contractType: "lazy" | "drop";
  maxSupply: number;
  mintPhases: {
    whitelist: MintPhaseView;
    og: MintPhaseView;
    public: MintPhaseView;
  };
}

export interface MintPhaseView {
  enabled: boolean;
  priceEth: number;
  allocation: number;
  walletLimit: number;
  startsAt: string | null;
  endsAt: string | null;
}

export interface UserRef {
  address: string;
  username: string;
  isVerified: boolean;
}

export interface TraitView {
  traitType: string;
  value: string;
  rarity: number;
}

export interface VoucherView {
  tokenId: string;
  uri: string;
  minPrice: string;
  creator: string;
  royaltyBps: number;
  nonce: number;
  signature: string;
  deadline: string;
}

// A seller-signed authorization for DurchexMarketplace.buyListed(Listing,signature) —
// present once the item's current owner has listed it for resale.
export interface ListingView {
  nft: string;
  tokenId: string;
  seller: string;
  buyer: string | null;
  price: string;
  deadline: string;
  nonce: string;
  signature: string;
}

export interface ItemDetailView extends ItemView {
  collectionId: string;
  description: string;
  tokenId: string | null;
  metadataUri: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaName?: string;
  chainId: number;
  contractAddress: string;
  viewCount: number;
  traits: TraitView[];
  owner: UserRef | null;
  creator: UserRef | null;
  voucher: VoucherView | null;
  listing: ListingView | null;
}

export interface SearchResults {
  items: ItemView[];
  collections: CollectionView[];
  users: UserRef[];
}

export interface NotificationView {
  id: string;
  type: "offer" | "bid" | "outbid" | "offer_accepted" | "sale" | "follow";
  itemId: string | null;
  itemName: string | null;
  collectionSlug: string | null;
  fromUser: UserRef | null;
  amountEth: number | null;
  read: boolean;
  createdAt: string;
}

export interface ActivityView {
  id: string;
  type: "mint" | "list" | "sale" | "transfer" | "bid" | "offer" | "cancel";
  itemId: string;
  itemName: string;
  collectionName: string;
  collectionSlug: string;
  from: UserRef | null;
  to: UserRef | null;
  priceEth: number | null;
  createdAt: string;
}

export interface BidView {
  id: string;
  type: "auction_bid" | "offer";
  amountEth: number;
  status: "active" | "accepted" | "rejected" | "cancelled" | "expired";
  bidder: UserRef;
  createdAt: string;
  expiresAt: string | null;
}

export interface DropView extends CollectionView {
  dropStartsAt: string;
  dropEndsAt: string;
  notifyCount: number;
  isNotifying: boolean;
  isLive: boolean;
}

export interface ProfileView {
  id: string;
  address: string;
  username: string;
  bio: string;
  isVerified: boolean;
  followerCount: number;
  followingCount: number;
  joinedAt: string;
}
