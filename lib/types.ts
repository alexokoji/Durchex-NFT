import { CategoryKey } from "@/components/ui/CategoryIcon";
import { VerificationTier } from "@/lib/verification";

export interface ItemView {
  id: string;
  name: string;
  imageUrl: string;
  mediaUrl?: string;
  mediaType?: string;
  collectionName: string;
  collectionSlug: string;
  collectionVerified: boolean;
  /** Verification tier of whoever created this item's collection, so the
   *  badge travels with their work rather than living only on a profile. */
  creatorTier: VerificationTier;
  category: CategoryKey;
  priceEth: number;
  priceUsd: number;
  // What this item last actually sold for, distinct from priceEth (the
  // current listing ask, 0 when not listed). Null until a sale settles.
  lastSalePriceEth: number | null;
  isMinted: boolean;
  status: "fixed_price" | "auction" | "sold" | "not_listed";
  standard: "ERC721" | "ERC1155";
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
  /** Verification tier of this collection's creator. */
  creatorTier: VerificationTier;
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
  /** Units of this collection actually minted on-chain so far. */
  mintedSupply: number;
  /** Units that exist to be minted at all, across every item. */
  totalUnits: number;
  /** The secondary market is live. Derived: true once the collection mints
   *  out, or earlier if the creator opened it. */
  resaleOpen: boolean;
  /** Every unit is on-chain, after which nobody can close resale again. */
  mintedOut: boolean;
  listingEnabled: boolean;
  /** Units still to mint before that happens. Zero once open. */
  mintRemaining: number;
  /** Percentage move in the floor over the last day; null with no baseline. */
  floorChange1dPct: number | null;
  /** Highest live collection-wide offer, in WETH. Null when none stands. */
  topOfferEth: number | null;
  links: { website: string; twitter: string; discord: string };
  createdAt: string;
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
  verificationTier: VerificationTier;
  avatarUrl: string;
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

export interface EditionVoucherView {
  tokenId: string;
  uri: string;
  minPrice: string; // per unit
  creator: string;
  royaltyBps: number;
  maxSupply: number;
  nonce: string;
  signature: string;
  deadline: string;
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
  /** Whether THIS item is fully minted — an edition of 50 needs all 50
   *  on-chain. That is what lets its owner list it for resale, and it
   *  mirrors the server-side gate in PATCH /api/items/[id]. */
  resaleOpen: boolean;
  /** Units of this item still to mint before that. */
  mintRemaining: number;
  /** Whether the parent collection's secondary market is open at all —
   *  an item can be finished while its collection is still minting. */
  collectionResaleOpen: boolean;
  /** Distinct wallets holding at least one unit. */
  ownersCount: number;
  /** Lowest live per-unit ask across every listing of this item. */
  itemFloorEth: number | null;
  /** Highest live offer on this item. */
  bestOfferEth: number | null;
  // ERC-1155 only.
  standard: "ERC721" | "ERC1155";
  totalSupply: number;
  mintedSupply: number;
  editionVoucher: EditionVoucherView | null;
  // The parent collection's mint configuration, carried onto the item so
  // its page can show the phase picker, timers and terms without a second
  // round trip. Phases are optional — a collection that never configured
  // any mints exactly as before.
  mintPhases: { whitelist: MintPhaseView; og: MintPhaseView; public: MintPhaseView };
  collectionMaxSupply: number;
  royaltyBps: number;
  contractType: "lazy" | "drop";
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
  verificationTier: VerificationTier;
  avatarUrl: string;
  bannerUrl: string;
  socials: { twitter: string; discord: string; website: string; instagram: string };
  followerCount: number;
  followingCount: number;
  joinedAt: string;
}
