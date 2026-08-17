// Minimal ABI mirroring DurchexNFT1155.sol — just what the client calls directly.
export const NFT1155_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "cancelEdition",
    stateMutability: "nonpayable",
    inputs: [
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
] as const;
