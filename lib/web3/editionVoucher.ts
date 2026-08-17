import { parseEther, zeroAddress, type Address } from "viem";

// Mirrors DurchexNFT1155.sol's EditionVoucher struct + EIP-712 domain.
// Unlike a 721 NFTVoucher (single-use, consumed by whichever buyer redeems
// it first), an EditionVoucher is reusable — many different buyers each
// redeem their own quantity against the same signature until maxSupply
// sells out.
export const EDITION_VOUCHER_DOMAIN_NAME = "DurchexNFT1155";
export const EDITION_VOUCHER_DOMAIN_VERSION = "1";

export const EDITION_VOUCHER_TYPES = {
  EditionVoucher: [
    { name: "tokenId", type: "uint256" },
    { name: "uri", type: "string" },
    { name: "minPrice", type: "uint256" },
    { name: "creator", type: "address" },
    { name: "royaltyBps", type: "uint96" },
    { name: "maxSupply", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const DEFAULT_EDITION_VOUCHER_VALIDITY_SECONDS = 180 * 24 * 60 * 60; // 180 days

export interface EditionVoucherMessage {
  tokenId: bigint;
  uri: string;
  minPrice: bigint;
  creator: Address;
  royaltyBps: bigint;
  maxSupply: bigint;
  nonce: bigint;
  deadline: bigint;
}

export function buildEditionVoucherTypedData({
  chainId,
  verifyingContract,
  tokenId,
  uri,
  pricePerUnitEth,
  creator,
  royaltyBps,
  maxSupply,
  nonce,
  deadlineSeconds = DEFAULT_EDITION_VOUCHER_VALIDITY_SECONDS,
}: {
  chainId: number;
  verifyingContract: string;
  tokenId: number;
  uri: string;
  pricePerUnitEth: number;
  creator: Address;
  royaltyBps: number;
  maxSupply: number;
  nonce: number;
  deadlineSeconds?: number;
}) {
  const message: EditionVoucherMessage = {
    tokenId: BigInt(tokenId),
    uri,
    minPrice: parseEther(pricePerUnitEth.toString()),
    creator,
    royaltyBps: BigInt(royaltyBps),
    maxSupply: BigInt(maxSupply),
    nonce: BigInt(nonce),
    deadline: BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds),
  };

  return {
    domain: {
      name: EDITION_VOUCHER_DOMAIN_NAME,
      version: EDITION_VOUCHER_DOMAIN_VERSION,
      chainId,
      verifyingContract: (verifyingContract || zeroAddress) as Address,
    },
    types: EDITION_VOUCHER_TYPES,
    primaryType: "EditionVoucher" as const,
    message,
  };
}
