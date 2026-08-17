import { parseEther, zeroAddress, type Address } from "viem";

// Mirrors DurchexMarketplace.sol's Listing1155 struct — a seller-signed
// authorization to sell up to `quantity` units at `pricePerUnit`. Unlike
// the ERC-721 Listing (single-use), several buyers can each fill part of
// the same Listing1155 until its quantity is exhausted.
export const LISTING1155_DOMAIN_NAME = "DurchexMarketplace";
export const LISTING1155_DOMAIN_VERSION = "1";

export const LISTING1155_TYPES = {
  Listing1155: [
    { name: "nft", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "seller", type: "address" },
    { name: "buyer", type: "address" },
    { name: "quantity", type: "uint256" },
    { name: "pricePerUnit", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const DEFAULT_LISTING1155_VALIDITY_SECONDS = 180 * 24 * 60 * 60; // 180 days

export interface Listing1155Message {
  nft: Address;
  tokenId: bigint;
  seller: Address;
  buyer: Address;
  quantity: bigint;
  pricePerUnit: bigint;
  deadline: bigint;
  nonce: bigint;
}

export function generateListing1155Nonce(): bigint {
  return BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
}

export function buildListing1155TypedData({
  chainId,
  verifyingContract,
  nft,
  tokenId,
  seller,
  buyer = zeroAddress,
  quantity,
  pricePerUnitEth,
  nonce,
  deadlineSeconds = DEFAULT_LISTING1155_VALIDITY_SECONDS,
}: {
  chainId: number;
  verifyingContract: string;
  nft: string;
  tokenId: string | number;
  seller: Address;
  buyer?: Address;
  quantity: number;
  pricePerUnitEth: number;
  nonce: bigint;
  deadlineSeconds?: number;
}) {
  const message: Listing1155Message = {
    nft: nft as Address,
    tokenId: BigInt(tokenId),
    seller,
    buyer,
    quantity: BigInt(quantity),
    pricePerUnit: parseEther(pricePerUnitEth.toString()),
    deadline: BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds),
    nonce,
  };

  return {
    domain: {
      name: LISTING1155_DOMAIN_NAME,
      version: LISTING1155_DOMAIN_VERSION,
      chainId,
      verifyingContract: (verifyingContract || zeroAddress) as Address,
    },
    types: LISTING1155_TYPES,
    primaryType: "Listing1155" as const,
    message,
  };
}
