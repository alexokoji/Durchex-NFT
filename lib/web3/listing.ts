import { parseEther, zeroAddress, type Address } from "viem";

// Mirrors the Listing struct + EIP-712 domain from DurchexMarketplace.sol's
// buyListed(Listing,signature) — a seller-signed authorization to sell an
// already-minted item at a specific price, so a buyer's purchase call
// carries a price cryptographically bound to what the seller agreed to,
// not a bare value trusted from the database.
export const LISTING_DOMAIN_NAME = "DurchexMarketplace";
export const LISTING_DOMAIN_VERSION = "1";

export const LISTING_TYPES = {
  Listing: [
    { name: "nft", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "seller", type: "address" },
    { name: "buyer", type: "address" },
    { name: "price", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

// Matches DEFAULT_VOUCHER_VALIDITY_SECONDS — long enough a seller doesn't
// have to re-sign an untouched listing every few weeks, short enough that
// an abandoned listing doesn't stay fillable forever.
export const DEFAULT_LISTING_VALIDITY_SECONDS = 180 * 24 * 60 * 60; // 180 days

export interface ListingMessage {
  nft: Address;
  tokenId: bigint;
  seller: Address;
  buyer: Address;
  price: bigint;
  deadline: bigint;
  nonce: bigint;
}

/** A fresh, effectively-unique nonce for a new listing (per-seller, boolean-used on-chain). */
export function generateListingNonce(): bigint {
  return BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
}

export function buildListingTypedData({
  chainId,
  verifyingContract,
  nft,
  tokenId,
  seller,
  buyer = zeroAddress,
  priceEth,
  nonce,
  deadlineSeconds = DEFAULT_LISTING_VALIDITY_SECONDS,
}: {
  chainId: number;
  verifyingContract: string;
  nft: string;
  tokenId: string | number;
  seller: Address;
  buyer?: Address;
  priceEth: number;
  nonce: bigint;
  deadlineSeconds?: number;
}) {
  const message: ListingMessage = {
    nft: nft as Address,
    tokenId: BigInt(tokenId),
    seller,
    buyer,
    price: parseEther(priceEth.toString()),
    deadline: BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds),
    nonce,
  };

  return {
    domain: {
      name: LISTING_DOMAIN_NAME,
      version: LISTING_DOMAIN_VERSION,
      chainId,
      verifyingContract: (verifyingContract || zeroAddress) as Address,
    },
    types: LISTING_TYPES,
    primaryType: "Listing" as const,
    message,
  };
}
