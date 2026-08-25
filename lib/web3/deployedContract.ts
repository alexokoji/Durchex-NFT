import { marketplaceAddressFor } from "@/lib/web3/marketplaceAbi";

// The one currently-live DurchexNFT deployment new ERC-721 collections
// default to. Update these (and contracts/deployments.json) when a new
// network goes live — e.g. after the mainnet deploy, flip
// DEFAULT_NFT_CHAIN_ID to 1 and DEFAULT_NFT_ADDRESS to the mainnet address.
export const DEFAULT_NFT_ADDRESS = process.env.DURCHEX_NFT_ADDRESS || "0x35A25Cd37b62F7896263cf1bA27727b90bd0a3a1";
export const DEFAULT_NFT_CHAIN_ID = Number(process.env.DURCHEX_NFT_CHAIN_ID || 1);

// Same idea, for ERC-1155 (multi-edition) collections — a separate
// contract from DurchexNFT since the token standard, transfer interface,
// and voucher shape all differ.
export const DEFAULT_NFT1155_ADDRESS =
  process.env.DURCHEX_NFT1155_ADDRESS || "0xe353063FA269752F9487AF3E4af7800122a0b0a0";
export const DEFAULT_NFT1155_CHAIN_ID = Number(process.env.DURCHEX_NFT1155_CHAIN_ID || 1);

/**
 * The shared lazy-mint contracts, per chain.
 *
 * A collection is created on one chain and stays there, so "which
 * DurchexNFT" is a per-chain question the same way the marketplace is. The
 * DEFAULT_* constants above remain the answer for anything that predates
 * a caller knowing its chain.
 */
// The Robinhood entries look like Ethereum's by coincidence, not by error:
// a CREATE address is derived from (deployer, nonce), so the same deployer
// starting from nonce 0 on a fresh chain reproduces the same addresses for
// entirely different contracts. 0x35A25Cd3… is DurchexNFT on Ethereum and
// DurchexMarketplace on Robinhood. Always resolve address *and* chain.
export const NFT_ADDRESSES: Record<number, `0x${string}`> = {
  1: "0x35A25Cd37b62F7896263cf1bA27727b90bd0a3a1",
  4663: "0xe353063FA269752F9487AF3E4af7800122a0b0a0",
  11155111: "0x20cA7ADa8b845EF77960D144bBaB7701a29Ade91",
};

export const NFT1155_ADDRESSES: Record<number, `0x${string}`> = {
  1: "0xe353063FA269752F9487AF3E4af7800122a0b0a0",
  4663: "0x42C971DAab6942f80c531675BB4Bf1cF57d30d05",
  11155111: "0x4f8a0a7E7A706E9F3016b21b98f4aD489781D7fD",
};

export type TokenStandard = "ERC721" | "ERC1155";

/**
 * Chains that have real contracts but must never be offered to a creator.
 *
 * Sepolia is fully deployed, which is the whole point of it — and that is
 * exactly why it would otherwise show up in the network picker beside
 * Ethereum, inviting someone to launch a real collection onto a testnet
 * whose tokens are worth nothing. A connected wallet can still switch to
 * it for development; this only governs where a collection may be created.
 */
const TESTNET_CHAIN_IDS = new Set([11155111, 80002, 763373, 46630, 31337]);

/** The shared lazy-mint contract for a standard on a chain, if one is live. */
export function nftAddressFor(standard: TokenStandard, chainId: number | undefined): `0x${string}` | undefined {
  if (chainId === undefined) return undefined;
  const map = standard === "ERC1155" ? NFT1155_ADDRESSES : NFT_ADDRESSES;
  const override = process.env[`DURCHEX_NFT${standard === "ERC1155" ? "1155" : ""}_ADDRESS_${chainId}`];
  return (override as `0x${string}` | undefined) ?? map[chainId];
}

/**
 * Chains a creator may actually launch a collection on.
 *
 * Derived from what is deployed rather than listed by hand, because the
 * two answers drift and only one of them is true. Offering a chain whose
 * contracts do not exist yet produces a collection that cannot be minted
 * — the creator finds out at the first purchase, which is the worst
 * possible moment.
 *
 * So a chain appears here the moment it has both a marketplace and the
 * shared contract for the standard in question, and not before. Adding a
 * chain to the wallet config is therefore safe on its own: it becomes
 * selectable when, and only when, the deploy lands.
 */
export function chainsAvailableForCreation(standard: TokenStandard): number[] {
  const map = standard === "ERC1155" ? NFT1155_ADDRESSES : NFT_ADDRESSES;
  return Object.keys(map)
    .map(Number)
    .filter(
      (chainId) =>
        !TESTNET_CHAIN_IDS.has(chainId) && nftAddressFor(standard, chainId) && marketplaceAddressFor(chainId)
    )
    .sort((a, b) => a - b);
}

/** Whether a creator may target this chain with this standard. */
export function canCreateOn(standard: TokenStandard, chainId: number): boolean {
  return chainsAvailableForCreation(standard).includes(chainId);
}
