import { concat, getContractAddress, keccak256, stringToHex, type Address, type Hex } from "viem";

/**
 * Client for DurchexCollectionFactory (contracts/contracts/DurchexCollectionFactory.sol)
 * — deploys one dedicated ERC-721 per collection as an EIP-1167 clone, so
 * every collection gets its own contract address instead of every lazy
 * mint on the platform sharing one (which is why external marketplaces
 * like OpenSea previously showed every Durchex collection merged into one
 * generic "Durchex" collection: one contract address is one collection to
 * them, and there was only ever one contract).
 *
 * Every function here is pure/deterministic and safe to import from either
 * a server route or a client component — nothing here talks to the chain
 * directly; the caller supplies whatever on-chain reads it already has
 * (e.g. bytecode-at-address) and this module only computes addresses and
 * builds calldata.
 */

// Deployed alongside the marketplace on each chain — see
// contracts/scripts/deploy-factory.ts, recorded in contracts/deployments.json.
// A chain with no entry here just means new collections on it keep using the
// shared DurchexNFT contract, exactly like every collection did before this
// existed.
export const COLLECTION_FACTORY_ADDRESSES: Record<number, Address> = {
  1: "0xc4cbC3A2f1ef10F5A4eD6651314812C3c7f09f76", // Ethereum mainnet
};
export const COLLECTION_IMPLEMENTATION_ADDRESSES: Record<number, Address> = {
  1: "0x60AcD2CF1700490bA19645721f588420c2F4d0a0", // Ethereum mainnet
};

export function collectionFactoryAddressFor(chainId: number | undefined): Address | undefined {
  if (chainId === undefined) return undefined;
  const override = process.env[`NEXT_PUBLIC_COLLECTION_FACTORY_${chainId}`];
  return (override as Address | undefined) ?? COLLECTION_FACTORY_ADDRESSES[chainId];
}

export function collectionImplementationAddressFor(chainId: number | undefined): Address | undefined {
  if (chainId === undefined) return undefined;
  const override = process.env[`NEXT_PUBLIC_COLLECTION_IMPLEMENTATION_${chainId}`];
  return (override as Address | undefined) ?? COLLECTION_IMPLEMENTATION_ADDRESSES[chainId];
}

export const COLLECTION_FACTORY_ABI = [
  {
    type: "function",
    name: "deployCollection",
    stateMutability: "nonpayable",
    inputs: [
      { name: "salt", type: "bytes32" },
      { name: "name_", type: "string" },
      { name: "symbol_", type: "string" },
      { name: "owner_", type: "address" },
    ],
    outputs: [{ name: "collection", type: "address" }],
  },
] as const;

/**
 * Every collection's clone lives at a salt derived from its own database
 * id — reproducible from either side (see DurchexCollectionFactory.sol's
 * own docs), and stable for the collection's lifetime since a Mongo _id
 * never changes.
 */
export function collectionSalt(collectionId: string): Hex {
  return keccak256(stringToHex(collectionId));
}

// EIP-1167 minimal proxy runtime bytecode, split around where the
// implementation address is spliced in — mirrors
// @openzeppelin/contracts/proxy/Clones.sol exactly (prefix + 20-byte
// implementation address + suffix), since the deployed address depends on
// hashing this exact byte sequence. Any deviation here would predict an
// address the factory doesn't actually deploy to.
const CLONE_PREFIX: Hex = "0x3d602d80600a3d3981f3363d3d373d3d3d363d73";
const CLONE_SUFFIX: Hex = "0x5af43d82803e903d91602b57fd5bf3";

/**
 * The address a collection's clone lives at, whether or not it's been
 * deployed yet — pure CREATE2 arithmetic, identical to what
 * DurchexCollectionFactory.predictCollection computes on-chain. Computed
 * locally (no RPC call) so it's available instantly at collection-creation
 * time, before the clone — or even the collection itself — exists.
 */
export function predictCloneAddress({
  implementation,
  salt,
  factory,
}: {
  implementation: Address;
  salt: Hex;
  factory: Address;
}): Address {
  const initCode = concat([CLONE_PREFIX, implementation, CLONE_SUFFIX]);
  return getContractAddress({ opcode: "CREATE2", from: factory, salt, bytecode: initCode });
}

/**
 * A short on-chain symbol from a collection's name — creator-facing name
 * stays free-form, but ERC-721 symbols are conventionally compact. Pure
 * function of the name so it never needs to be stored separately: computed
 * identically wherever it's needed (creation-time address prediction, or
 * the actual on-chain deploy call later), and only ever matters for the
 * collection's own initial on-chain symbol()
 * — cosmetic, not load-bearing for anything else.
 */
export function deriveCollectionSymbol(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (letters.slice(0, 5) || "DURX");
}
