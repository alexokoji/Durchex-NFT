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
      { name: "nft", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "seller", type: "address" },
      { name: "price", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// Standard ERC-721 approval functions — DurchexNFT inherits these unmodified
// from OpenZeppelin's ERC721URIStorage. buyListed needs the marketplace
// contract approved to move the token out of the seller's wallet.
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

export const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS as
  | `0x${string}`
  | undefined;
