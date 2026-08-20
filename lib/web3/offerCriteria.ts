import { keccak256, encodePacked, concat, zeroHash, type Address, parseEther } from "viem";

/**
 * Merkle set of eligible token ids for a collection offer, matching
 * OpenZeppelin's MerkleProof verification (sorted sibling pairs, leaves of
 * keccak256(abi.encodePacked(uint256 tokenId))).
 *
 * This is how a collection offer expresses *which* NFTs may fill it. It
 * can't be done by NFT contract address here, because every collection in
 * this marketplace shares one deployed ERC-721 (see deployedContract.ts) —
 * so an address-scoped offer would be fillable by an item from a
 * completely different collection. Narrowing the same set also gives
 * trait/rarity criteria for free.
 */
export function leafOf(tokenId: string | number | bigint): `0x${string}` {
  return keccak256(encodePacked(["uint256"], [BigInt(tokenId)]));
}

function hashPair(a: `0x${string}`, b: `0x${string}`): `0x${string}` {
  return a.toLowerCase() <= b.toLowerCase() ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

export function merkleRoot(leaves: `0x${string}`[]): `0x${string}` {
  if (leaves.length === 0) return zeroHash;
  let level = [...leaves].sort();
  while (level.length > 1) {
    const next: `0x${string}`[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? hashPair(level[i], level[i + 1]) : level[i]);
    }
    level = next;
  }
  return level[0];
}

export function merkleProof(leaves: `0x${string}`[], target: `0x${string}`): `0x${string}`[] {
  let level = [...leaves].sort();
  const proof: `0x${string}`[] = [];
  let idx = level.indexOf(target);
  if (idx === -1) return proof;
  while (level.length > 1) {
    const next: `0x${string}`[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : null;
      if (i === idx || i + 1 === idx) {
        if (right !== null) proof.push(i === idx ? right : left);
        idx = next.length;
      }
      next.push(right !== null ? hashPair(left, right) : left);
    }
    level = next;
  }
  return proof;
}

export function rootForTokenIds(tokenIds: (string | number)[]): `0x${string}` {
  return merkleRoot(tokenIds.map(leafOf));
}

export function proofForTokenId(tokenIds: (string | number)[], tokenId: string | number): `0x${string}`[] {
  return merkleProof(tokenIds.map(leafOf), leafOf(tokenId));
}

// ---------------------------------------------------------------------------
// EIP-712 typed data for DurchexOffers.CollectionOffer
// ---------------------------------------------------------------------------

export const OFFER_DOMAIN_NAME = "DurchexOffers";
export const OFFER_DOMAIN_VERSION = "1";

export const COLLECTION_OFFER_TYPES = {
  CollectionOffer: [
    { name: "nft", type: "address" },
    { name: "isERC1155", type: "bool" },
    { name: "criteriaRoot", type: "bytes32" },
    { name: "pricePerItem", type: "uint256" },
    { name: "quantity", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "buyer", type: "address" },
  ],
} as const;

export function generateOfferNonce(): bigint {
  return BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
}

export function buildCollectionOfferTypedData({
  chainId,
  verifyingContract,
  nft,
  isERC1155,
  criteriaRoot,
  pricePerItemEth,
  quantity,
  deadlineSeconds,
  nonce,
  buyer,
}: {
  chainId: number;
  verifyingContract: string;
  nft: string;
  isERC1155: boolean;
  criteriaRoot: `0x${string}`;
  pricePerItemEth: number;
  quantity: number;
  deadlineSeconds: number;
  nonce: bigint;
  buyer: Address;
}) {
  const message = {
    nft: nft as Address,
    isERC1155,
    criteriaRoot,
    pricePerItem: parseEther(pricePerItemEth.toString()),
    quantity: BigInt(quantity),
    deadline: BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds),
    nonce,
    buyer,
  };
  return {
    domain: {
      name: OFFER_DOMAIN_NAME,
      version: OFFER_DOMAIN_VERSION,
      chainId,
      verifyingContract: verifyingContract as Address,
    },
    types: COLLECTION_OFFER_TYPES,
    primaryType: "CollectionOffer" as const,
    message,
  };
}

// Live DurchexOffers deployments and the WETH each is denominated in.
export const OFFERS_ADDRESSES: Record<number, `0x${string}`> = {
  1: "0x6c25bdD92906eb97601410198D398526bA792468", // Ethereum mainnet
  11155111: "0x2F2E298386c522D041c9de9eceCBFc50A8299721", // Sepolia
};
export const WETH_ADDRESSES: Record<number, `0x${string}`> = {
  1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  11155111: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
};

export function offersAddressFor(chainId: number | undefined): `0x${string}` | undefined {
  if (chainId === undefined) return undefined;
  const override = process.env[`NEXT_PUBLIC_OFFERS_ADDRESS_${chainId}`];
  return (override as `0x${string}` | undefined) ?? OFFERS_ADDRESSES[chainId];
}

export function wethAddressFor(chainId: number | undefined): `0x${string}` | undefined {
  return chainId === undefined ? undefined : WETH_ADDRESSES[chainId];
}

export const OFFERS_ABI = [
  {
    type: "function",
    name: "acceptCollectionOffer",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "offer",
        type: "tuple",
        components: [
          { name: "nft", type: "address" },
          { name: "isERC1155", type: "bool" },
          { name: "criteriaRoot", type: "bytes32" },
          { name: "pricePerItem", type: "uint256" },
          { name: "quantity", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "buyer", type: "address" },
        ],
      },
      { name: "signature", type: "bytes" },
      { name: "tokenId", type: "uint256" },
      { name: "quantity", type: "uint256" },
      { name: "criteriaProof", type: "bytes32[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelOffer",
    stateMutability: "nonpayable",
    inputs: [{ name: "nonce", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "offerFilled",
    stateMutability: "view",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

/**
 * WETH's own entry point, beyond the ERC-20 surface.
 *
 * Offers must settle by pulling funds from the buyer at accept time, and
 * native ETH cannot be pulled — only the owner can send it, and they are
 * not present when the holder accepts. Wrapping is what makes an offer
 * possible at all, so the buyer's ETH is wrapped for them as part of
 * making one rather than being told to go and do it elsewhere.
 */
export const WETH_ABI = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;
