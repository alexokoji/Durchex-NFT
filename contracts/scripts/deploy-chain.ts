import { ethers, network } from "hardhat";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Brings the full Durchex contract set live on a chain that has none.
 *
 * Ordered so that a run which dies partway still leaves something usable:
 * the marketplace and the two shared lazy-mint contracts come first and are
 * wired together immediately, then the offers escrow, then the collection
 * factories. A chain with no factory simply keeps every collection on the
 * shared contract, which is how the platform worked before factories
 * existed — so losing the tail of this list is a degradation, not a break.
 *
 * Every step is resumable. Robinhood Chain's public RPC drops calls, and a
 * timeout while polling for a receipt is indistinguishable from a failed
 * deploy even though the transaction is mining — that is how Ethereum ended
 * up paying to deploy the same marketplace twice. Pass an address back in
 * through the matching EXISTING_* variable and this adopts it instead.
 */
type Step = {
  name: string;
  artifact: string;
  args: () => unknown[];
  env: string;
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const balance = await ethers.provider.getBalance(deployer.address);
  const fees = await ethers.provider.getFeeData();
  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS || deployer.address;

  console.log(`Network      : ${network.name} (chain ${chainId})`);
  console.log(`Deployer     : ${deployer.address}`);
  console.log(`Balance      : ${ethers.formatEther(balance)} ETH`);
  console.log(`Gas price    : ${ethers.formatUnits(fees.gasPrice ?? 0n, "gwei")} gwei`);
  console.log(`Fee recipient: ${feeRecipient}\n`);

  const deployed: Record<string, string> = {};

  async function step({ name, artifact, args, env }: Step) {
    const existing = process.env[env];
    if (existing) {
      if ((await ethers.provider.getCode(existing)) === "0x") {
        throw new Error(`${env}=${existing} but nothing is deployed there`);
      }
      console.log(`  ${name.padEnd(30)} ${existing}  (adopted)`);
      deployed[artifact] = existing;
      return ethers.getContractAt(artifact, existing, deployer);
    }
    const contract = await (await ethers.getContractFactory(artifact, deployer)).deploy(...args());
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    console.log(`  ${name.padEnd(30)} ${address}`);
    deployed[artifact] = address;
    return contract;
  }

  console.log("── Core: marketplace and the shared lazy-mint contracts ──");
  const marketplace = await step({
    name: "DurchexMarketplace",
    artifact: "DurchexMarketplace",
    args: () => [feeRecipient],
    env: "EXISTING_MARKETPLACE",
  });
  const marketplaceAddress = await marketplace.getAddress();

  const nft = await step({ name: "DurchexNFT", artifact: "DurchexNFT", args: () => [], env: "EXISTING_NFT" });
  const nft1155 = await step({
    name: "DurchexNFT1155",
    artifact: "DurchexNFT1155",
    args: () => [],
    env: "EXISTING_NFT1155",
  });

  console.log("\n── Wiring ──");
  for (const [label, contract] of [
    ["DurchexNFT", nft],
    ["DurchexNFT1155", nft1155],
  ] as const) {
    const current = await contract.marketplace();
    if (current.toLowerCase() === marketplaceAddress.toLowerCase()) {
      console.log(`  ${label.padEnd(30)} already -> ${marketplaceAddress}`);
      continue;
    }
    await (await contract.setMarketplace(marketplaceAddress)).wait();
    console.log(`  ${label.padEnd(30)} -> ${await contract.marketplace()}`);
  }

  console.log("\n── Offers escrow ──");
  await step({
    name: "DurchexOffersEscrow",
    artifact: "DurchexOffersEscrow",
    args: () => [feeRecipient],
    env: "EXISTING_ESCROW",
  });

  console.log("\n── Collection factories (each deploys its own implementation) ──");
  const factory721 = await step({
    name: "DurchexCollectionFactory",
    artifact: "DurchexCollectionFactory",
    args: () => [marketplaceAddress],
    env: "EXISTING_FACTORY_721",
  });
  const factory1155 = await step({
    name: "DurchexCollection1155Factory",
    artifact: "DurchexCollection1155Factory",
    args: () => [marketplaceAddress],
    env: "EXISTING_FACTORY_1155",
  });
  const impl721 = await factory721.implementation();
  const impl1155 = await factory1155.implementation();
  console.log(`  ${"DurchexCollection (impl)".padEnd(30)} ${impl721}`);
  console.log(`  ${"DurchexCollection1155 (impl)".padEnd(30)} ${impl1155}`);

  // Read the live values back rather than trusting the constructors — the
  // last chance to catch a misconfigured deployment before anyone transacts.
  console.log("\n── Post-deploy verification ──");
  const checks: [string, unknown, unknown][] = [
    ["marketplace.feeRecipient", await marketplace.feeRecipient(), feeRecipient],
    ["marketplace.owner", await marketplace.owner(), deployer.address],
    ["marketplace.paused", await marketplace.paused(), false],
    ["nft.marketplace", await nft.marketplace(), marketplaceAddress],
    ["nft1155.marketplace", await nft1155.marketplace(), marketplaceAddress],
    ["factory721.marketplace", await factory721.marketplace(), marketplaceAddress],
    ["factory1155.marketplace", await factory1155.marketplace(), marketplaceAddress],
  ];
  let ok = true;
  for (const [label, actual, expected] of checks) {
    const good = String(actual).toLowerCase() === String(expected).toLowerCase();
    if (!good) ok = false;
    console.log(`  ${good ? "OK  " : "FAIL"} ${label.padEnd(26)} ${actual}`);
  }
  console.log(`  platformFeeBps ${await marketplace.platformFeeBps()} (cap ${await marketplace.MAX_PLATFORM_FEE_BPS()})`);
  if (!ok) throw new Error("Post-deploy verification FAILED — wiring does not match intent");

  const deployedAtBlock = await ethers.provider.getBlockNumber();
  const deploymentsPath = join(__dirname, "..", "deployments.json");
  const all = existsSync(deploymentsPath) ? JSON.parse(readFileSync(deploymentsPath, "utf-8")) : {};
  all[network.name] = {
    ...(all[network.name] ?? {}),
    chainId,
    DurchexMarketplace: deployed.DurchexMarketplace,
    DurchexNFT: deployed.DurchexNFT,
    DurchexNFT1155: deployed.DurchexNFT1155,
    DurchexOffersEscrow: deployed.DurchexOffersEscrow,
    DurchexCollectionFactory: deployed.DurchexCollectionFactory,
    DurchexCollectionImplementation: impl721,
    DurchexCollection1155Factory: deployed.DurchexCollection1155Factory,
    DurchexCollection1155Implementation: impl1155,
    feeRecipient,
    deployedAtBlock,
    deployedAt: new Date().toISOString(),
  };
  if (network.name !== "hardhat") {
    writeFileSync(deploymentsPath, JSON.stringify(all, null, 2) + "\n");
    console.log(`\nRecorded in ${deploymentsPath}`);
  } else {
    console.log("\n(rehearsal: deployments.json left untouched)");
  }

  const spent = balance - (await ethers.provider.getBalance(deployer.address));
  console.log(`\nSpent ${ethers.formatEther(spent)} ETH, ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH left.`);
  console.log(`\nApp maps to update for chain ${chainId} (deploy block ${deployedAtBlock}):`);
  console.log(`  MARKETPLACE_ADDRESSES                    ${deployed.DurchexMarketplace}`);
  console.log(`  OFFERS_ESCROW_ADDRESSES                  ${deployed.DurchexOffersEscrow}`);
  console.log(`  NFT_ADDRESSES                            ${deployed.DurchexNFT}`);
  console.log(`  NFT1155_ADDRESSES                        ${deployed.DurchexNFT1155}`);
  console.log(`  COLLECTION_FACTORY_ADDRESSES             ${deployed.DurchexCollectionFactory}`);
  console.log(`  COLLECTION_IMPLEMENTATION_ADDRESSES      ${impl721}`);
  console.log(`  COLLECTION_1155_FACTORY_ADDRESSES        ${deployed.DurchexCollection1155Factory}`);
  console.log(`  COLLECTION_1155_IMPLEMENTATION_ADDRESSES ${impl1155}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
