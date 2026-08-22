/**
 * DurchexOffersEscrow — offers denominated in native ETH.
 *
 * Replaces the WETH pull model. The buyer sends real ETH when they make an
 * offer and the contract holds it until a holder accepts or the buyer
 * withdraws, so an offer is in ETH and is always funded. Under the old
 * model a buyer could spend the balance out from under their own live
 * offer, and the revert landed on whichever holder tried to accept.
 *
 * Offers live on-chain as state rather than as EIP-712 signatures, which
 * removes the whole class of signature-mismatch failures: there is no
 * typed data to keep in step between contract and client.
 */
export const OFFERS_ESCROW_ADDRESSES: Record<number, `0x${string}`> = {
  // Ethereum mainnet. Replaced 0xA3fe0869… on 2026-08-22 alongside the
  // marketplace, so an offer settles the royalty the same way a listing
  // does. The old escrow held no deposits at the time, so nobody's ETH was
  // stranded by the move; withdrawOffer on it stays available regardless.
  1: "0xf0cC2e562FaF58B52ab6cd3650B3B4fA06230ef2",
};

export function offersEscrowAddressFor(chainId: number | undefined): `0x${string}` | undefined {
  if (chainId === undefined) return undefined;
  const override = process.env[`NEXT_PUBLIC_OFFERS_ESCROW_ADDRESS_${chainId}`];
  return (override as `0x${string}` | undefined) ?? OFFERS_ESCROW_ADDRESSES[chainId];
}

export const OFFERS_ESCROW_ABI = [
  {
    type: "function",
    name: "makeOffer",
    stateMutability: "payable",
    inputs: [
      { name: "nft", type: "address" },
      { name: "isERC1155", type: "bool" },
      { name: "criteriaRoot", type: "bytes32" },
      { name: "pricePerItem", type: "uint256" },
      { name: "quantity", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "offerId", type: "uint256" }],
  },
  {
    type: "function",
    name: "acceptOffer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "offerId", type: "uint256" },
      { name: "tokenId", type: "uint256" },
      { name: "quantity", type: "uint256" },
      { name: "criteriaProof", type: "bytes32[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawOffer",
    stateMutability: "nonpayable",
    inputs: [{ name: "offerId", type: "uint256" }],
    outputs: [],
  },
  {
    // The public mapping getter, so the server can read an offer back and
    // confirm who funded it rather than trusting an id posted to it.
    type: "function",
    name: "offers",
    stateMutability: "view",
    inputs: [{ name: "offerId", type: "uint256" }],
    outputs: [
      { name: "buyer", type: "address" },
      { name: "nft", type: "address" },
      { name: "isERC1155", type: "bool" },
      { name: "criteriaRoot", type: "bytes32" },
      { name: "pricePerItem", type: "uint256" },
      { name: "quantity", type: "uint256" },
      { name: "filled", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "escrow", type: "uint256" },
      { name: "cancelled", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "escrowOf",
    stateMutability: "view",
    inputs: [{ name: "offerId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "OfferMade",
    inputs: [
      { name: "offerId", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "nft", type: "address", indexed: true },
      { name: "criteriaRoot", type: "bytes32", indexed: false },
      { name: "pricePerItem", type: "uint256", indexed: false },
      { name: "quantity", type: "uint256", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "OfferFilled",
    inputs: [
      { name: "offerId", type: "uint256", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "buyer", type: "address", indexed: false },
      { name: "quantity", type: "uint256", indexed: false },
      { name: "totalPrice", type: "uint256", indexed: false },
    ],
  },
  // Custom errors from the OpenZeppelin bases the contract inherits, and
  // from the NFTs it moves. Without these in the ABI a revert decodes to
  // nothing and surfaces as "reverted with the following signature: 0x…",
  // which names the failure in a way nobody can act on. Solidity string
  // requires decode without help; custom errors do not.
  {
    type: "error",
    name: "ERC1155MissingApprovalForAll",
    inputs: [
      { name: "operator", type: "address" },
      { name: "owner", type: "address" },
    ],
  },
  {
    type: "error",
    name: "ERC1155InsufficientBalance",
    inputs: [
      { name: "sender", type: "address" },
      { name: "balance", type: "uint256" },
      { name: "needed", type: "uint256" },
      { name: "tokenId", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ERC721InsufficientApproval",
    inputs: [
      { name: "operator", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ERC721IncorrectOwner",
    inputs: [
      { name: "sender", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "owner", type: "address" },
    ],
  },
  { type: "error", name: "ERC721NonexistentToken", inputs: [{ name: "tokenId", type: "uint256" }] },
  { type: "error", name: "EnforcedPause", inputs: [] },
  { type: "error", name: "ReentrancyGuardReentrantCall", inputs: [] },
  {
    type: "event",
    name: "OfferWithdrawn",
    inputs: [
      { name: "offerId", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "refunded", type: "uint256", indexed: false },
    ],
  },
] as const;
