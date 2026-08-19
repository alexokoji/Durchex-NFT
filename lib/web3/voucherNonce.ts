import { createPublicClient, http, type Chain } from "viem";
import { mainnet, sepolia, polygon, polygonAmoy, base, arbitrum, optimism, hardhat } from "viem/chains";
import { Item } from "@/lib/models/Item";
import { Collection } from "@/lib/models/Collection";
import { Types } from "mongoose";

const CHAINS: Record<number, Chain> = Object.fromEntries(
  [mainnet, sepolia, polygon, polygonAmoy, base, arbitrum, optimism, hardhat].map((c) => [c.id, c])
);

const NONCES_ABI = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * The nonce a creator's next lazy-mint voucher must carry.
 *
 * This has to be derived from the chain, not from a counter on the user:
 * DurchexNFT tracks `nonces[creator]` per *contract*, and every chain has
 * its own deployment, so a single per-user counter drifts the moment a
 * creator mints on one chain and then lists on another — every voucher
 * they sign afterwards carries a nonce the target contract will reject,
 * and the purchase reverts.
 *
 * Vouchers already signed but not yet redeemed still occupy the nonces
 * above the on-chain value, so those are counted too — otherwise two
 * outstanding vouchers would share a nonce and only one could ever be
 * redeemed, permanently stranding the other.
 */
export async function nextVoucherNonce({
  creatorId,
  creatorAddress,
  contractAddress,
  chainId,
}: {
  creatorId: Types.ObjectId | string;
  creatorAddress: string;
  contractAddress: string;
  chainId: number;
}): Promise<number> {
  const chain = CHAINS[chainId];
  if (!chain || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
    // No reachable contract to ask — fall back to counting local pending
    // vouchers, which at least stays self-consistent for drafts.
    return countPending({ creatorId, contractAddress, chainId });
  }

  const rpc = process.env[`RPC_URL_${chainId}`] ?? (chainId === 1 ? process.env.MAINNET_RPC_URL : undefined);
  const client = createPublicClient({
    chain,
    transport:
      chainId === hardhat.id ? http("http://127.0.0.1:8545") : rpc ? http(rpc, { timeout: 20_000 }) : http(),
  });

  // A collection's contract is deployed lazily, at its first mint, so until
  // then there is nothing at the address to ask. That isn't an error and
  // must not be treated as one: a contract that doesn't exist yet has
  // minted nothing, so its creator nonce is definitionally 0 and only the
  // locally pending vouchers count. Without this, every collection created
  // through the factory would fail to accept its first item.
  const deployed = await client.getBytecode({ address: contractAddress as `0x${string}` }).catch(() => undefined);
  if (!deployed || deployed === "0x") {
    return countPending({ creatorId, contractAddress, chainId });
  }

  let onChain = 0;
  try {
    const value = await client.readContract({
      address: contractAddress as `0x${string}`,
      abi: NONCES_ABI,
      functionName: "nonces",
      args: [creatorAddress as `0x${string}`],
    });
    onChain = Number(value);
  } catch {
    // An unreachable RPC must not silently hand back a nonce the contract
    // would reject, so surface it rather than guessing.
    throw new Error("Couldn't read the creator nonce from the contract — try again shortly");
  }

  return onChain + (await countPending({ creatorId, contractAddress, chainId }));
}

/** Unredeemed vouchers this creator already signed against the same contract. */
async function countPending({
  creatorId,
  contractAddress,
  chainId,
}: {
  creatorId: Types.ObjectId | string;
  contractAddress: string;
  chainId: number;
}): Promise<number> {
  const collections = await Collection.find({
    contractAddress: { $regex: `^${contractAddress}$`, $options: "i" },
    chainId,
  })
    .select("_id")
    .lean();
  if (collections.length === 0) return 0;

  return Item.countDocuments({
    creator: creatorId,
    collection: { $in: collections.map((c) => c._id) },
    isMinted: false,
    "voucher.signature": { $exists: true, $ne: null },
  });
}
