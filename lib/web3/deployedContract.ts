// The one currently-live DurchexNFT deployment new ERC-721 collections
// default to. Update these (and contracts/deployments.json) when a new
// network goes live — e.g. after the mainnet deploy, flip
// DEFAULT_NFT_CHAIN_ID to 1 and DEFAULT_NFT_ADDRESS to the mainnet address.
export const DEFAULT_NFT_ADDRESS = process.env.DURCHEX_NFT_ADDRESS || "0xFd110487BdA337E08B7Ad18c563d41a6F1A4259E";
export const DEFAULT_NFT_CHAIN_ID = Number(process.env.DURCHEX_NFT_CHAIN_ID || 11155111);

// Same idea, for ERC-1155 (multi-edition) collections — a separate
// contract from DurchexNFT since the token standard, transfer interface,
// and voucher shape all differ.
export const DEFAULT_NFT1155_ADDRESS =
  process.env.DURCHEX_NFT1155_ADDRESS || "0xe353063FA269752F9487AF3E4af7800122a0b0a0";
export const DEFAULT_NFT1155_CHAIN_ID = Number(process.env.DURCHEX_NFT1155_CHAIN_ID || 11155111);
