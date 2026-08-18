// Minimal ABI mirroring DurchexMarketplace.sol (contracts/contracts/DurchexMarketplace.sol)
// — just the functions the client actually calls.
export const MARKETPLACE_ABI = [
  {
    type: "function",
    name: "buyLazy",
    stateMutability: "payable",
    inputs: [
      { name: "nft", type: "address" },
      {
        name: "voucher",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "uri", type: "string" },
          { name: "minPrice", type: "uint256" },
          { name: "creator", type: "address" },
          { name: "royaltyBps", type: "uint96" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "buyListed",
    stateMutability: "payable",
    inputs: [
      {
        name: "listing",
        type: "tuple",
        components: [
          { name: "nft", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "seller", type: "address" },
          { name: "buyer", type: "address" },
          { name: "price", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelListing",
    stateMutability: "nonpayable",
    inputs: [{ name: "nonce", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "buyLazy1155",
    stateMutability: "payable",
    inputs: [
      { name: "nft", type: "address" },
      { name: "quantity", type: "uint256" },
      {
        name: "voucher",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "uri", type: "string" },
          { name: "minPrice", type: "uint256" },
          { name: "creator", type: "address" },
          { name: "royaltyBps", type: "uint96" },
          { name: "maxSupply", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "buyListed1155",
    stateMutability: "payable",
    inputs: [
      {
        name: "listing",
        type: "tuple",
        components: [
          { name: "nft", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "seller", type: "address" },
          { name: "buyer", type: "address" },
          { name: "quantity", type: "uint256" },
          { name: "pricePerUnit", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      },
      { name: "quantity", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelListing1155",
    stateMutability: "nonpayable",
    inputs: [{ name: "nonce", type: "uint256" }],
    outputs: [],
  },
] as const;

// Standard ERC-721/ERC-1155 approval functions (identical signatures on
// both standards) — buyListed/buyListed1155 need the marketplace contract
// approved to move tokens out of the seller's wallet.
export const ERC721_APPROVAL_ABI = [
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

// Live DurchexMarketplace deployments, keyed by chainId. This has to be a
// map rather than a single address: collections store their own chainId, so
// with mainnet and Sepolia both live the correct marketplace depends on
// which chain the item belongs to. A single global would send mainnet
// calldata to a Sepolia item (and make server-side purchase verification
// reject perfectly valid purchases on the other chain).
export const MARKETPLACE_ADDRESSES: Record<number, `0x${string}`> = {
  1: "0x42C971DAab6942f80c531675BB4Bf1cF57d30d05", // Ethereum mainnet
  11155111: "0x3f1Ef15a97BB939D4132339becD9305e3D7e011F", // Sepolia
};

/** The marketplace contract serving a given chain, or undefined if unsupported. */
export function marketplaceAddressFor(chainId: number | undefined): `0x${string}` | undefined {
  if (chainId === undefined) return undefined;
  const override = process.env[`NEXT_PUBLIC_MARKETPLACE_ADDRESS_${chainId}`];
  return (override as `0x${string}` | undefined) ?? MARKETPLACE_ADDRESSES[chainId];
}

