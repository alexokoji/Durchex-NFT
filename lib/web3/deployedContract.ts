// The one currently-live DurchexNFT deployment new collections default to.
// Update these (and contracts/deployments.json) when a new network goes
// live — e.g. after the mainnet deploy, flip DEFAULT_NFT_CHAIN_ID to 1 and
// DEFAULT_NFT_ADDRESS to the mainnet DurchexNFT address.
export const DEFAULT_NFT_ADDRESS = process.env.DURCHEX_NFT_ADDRESS || "0xd141E754DC30F357540B3b11D7ea556FC3C62e70";
export const DEFAULT_NFT_CHAIN_ID = Number(process.env.DURCHEX_NFT_CHAIN_ID || 11155111);
