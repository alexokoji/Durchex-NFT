// Minimal ABI mirroring DurchexMarketplace.sol (contracts/contracts/DurchexMarketplace.sol)
// — just the one function the client actually calls.
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
] as const;

export const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS as
  | `0x${string}`
  | undefined;
