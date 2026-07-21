import { parseEther, zeroAddress, type Address } from "viem";

// Mirrors the NFTVoucher struct + EIP-712 domain from DurchexNFT.sol in the
// spec (docs/Durchex-NFT-Marketplace-Full-Specification.pdf, section 5.1).
// Signing this now — before the contract is deployed — means listings created
// today will carry a valid, replayable signature the moment DurchexNFT goes
// live; nothing about the create flow has to change later.
export const VOUCHER_DOMAIN_NAME = "Durchex";
export const VOUCHER_DOMAIN_VERSION = "1";

export const VOUCHER_TYPES = {
  NFTVoucher: [
    { name: "tokenId", type: "uint256" },
    { name: "uri", type: "string" },
    { name: "minPrice", type: "uint256" },
    { name: "creator", type: "address" },
    { name: "royaltyBps", type: "uint96" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export interface NFTVoucherMessage {
  tokenId: bigint;
  uri: string;
  minPrice: bigint;
  creator: Address;
  royaltyBps: bigint;
  nonce: bigint;
}

export function buildVoucherTypedData({
  chainId,
  verifyingContract,
  tokenId,
  uri,
  priceEth,
  creator,
  royaltyBps,
  nonce,
}: {
  chainId: number;
  verifyingContract: string;
  tokenId: number;
  uri: string;
  priceEth: number;
  creator: Address;
  royaltyBps: number;
  nonce: number;
}) {
  const message: NFTVoucherMessage = {
    tokenId: BigInt(tokenId),
    uri,
    minPrice: parseEther(priceEth.toString()),
    creator,
    royaltyBps: BigInt(royaltyBps),
    nonce: BigInt(nonce),
  };

  return {
    domain: {
      name: VOUCHER_DOMAIN_NAME,
      version: VOUCHER_DOMAIN_VERSION,
      chainId,
      // Collections created before the marketplace contract is deployed don't
      // have a real address yet — the signature is still valid EIP-712 data,
      // it just can't be verified on-chain until the contract exists.
      verifyingContract: (verifyingContract || zeroAddress) as Address,
    },
    types: VOUCHER_TYPES,
    primaryType: "NFTVoucher" as const,
    message,
  };
}
