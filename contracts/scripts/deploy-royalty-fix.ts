import { ethers, network } from "hardhat";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Deploys the settlement contracts carrying the royalty override and moves
 * the whole platform onto them.
 *
 * GENESIS DURX's royalty receiver is a creator wallet that has been
 * delegated (EIP-7702) to a sweeper, and ERC-2981 stamped that address into
 * the token at first mint. The deployed DurchexNFT1155 has no setter, so
 * the only way to stop paying the attacker is to settle through contracts
 * that know to pay someone else.
 *
 * Both settlement paths are replaced, not just the marketplace: an offer
 * accepted through the escrow reaches the same royalty. The escrow held no
 * escrowed ETH at the time of writing, so nobody's deposit is stranded by
 * moving off the old one.
 *
 * Everything that points at a marketplace has to be re-pointed in the same
 * run, or a lazy mint would fail with "only marketplace":
 *   - DurchexNFT and DurchexNFT1155, the shared lazy-mint contracts
 *   - both collection factories, so clones deployed later are born correct
 *
 * Rehearse with scripts/simulate-royalty-fix.ts before running this.
 */
const RESCUE_ROYALTY_RECEIVER = "0xb73a051F878bb7359aa384Ada61aa276898F244B";
const GENESIS_DURX_TOKEN_ID = 1787072293483n;

async function main() {
  const deploymentsPath = join(__dirname, "..", "deployments.json");
  const all = existsSync(deploymentsPath) ? JSON.parse(readFileSync(deploymentsPath, "utf-8")) : {};
  // Resolved by chain id, not network name, so a FORK=1 rehearsal reads the
  // very same mainnet addresses this will operate on for real.
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const key =
    Object.keys(all).find((name) => Number(all[name]?.chainId) === chainId) ??
    (network.name in all ? network.name : undefined);
  if (!key) throw new Error(`No deployment recorded for chain ${chainId}`);
  const current = all[key];
  // A fork must never rewrite the record of what is live on mainnet.
  const rehearsal = network.name === "hardhat";

  // Every contract being rewired is owned by the wallet that deployed them,
  // which on a real run is the configured deployer key. A rehearsal has no
  // such key, so it borrows the owner's identity instead — otherwise the
  // dry run would only ever prove that an unauthorized caller is rejected.
  const [defaultSigner] = await ethers.getSigners();
  let deployer = defaultSigner;
  if (rehearsal) {
    const owner: string = await (await ethers.getContractAt("DurchexNFT", current.DurchexNFT)).owner();
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [owner] });
    await network.provider.send("hardhat_setBalance", [owner, "0x56BC75E2D63100000"]);
    deployer = await ethers.getSigner(owner);
  }

  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS || current.feeRecipient || deployer.address;
  const balance = await ethers.provider.getBalance(deployer.address);
  const fees = await ethers.provider.getFeeData();

  console.log(`Network      : ${network.name} (chain ${chainId})${rehearsal ? "  [REHEARSAL — nothing is real]" : ""}`);
  console.log(`Deployer     : ${deployer.address}`);
  console.log(`Balance      : ${ethers.formatEther(balance)} ETH`);
  console.log(`Gas price    : ${ethers.formatUnits(fees.gasPrice ?? 0n, "gwei")} gwei`);
  console.log(`Fee recipient: ${feeRecipient}\n`);

  // Resumable. A flaky RPC can time out while polling for a receipt after
  // the transaction has already been mined, and re-running from scratch
  // would pay to deploy a second copy of a contract that already exists —
  // so an address that landed can be handed back in and adopted.
  console.log("── Deploying ──");
  const adopt = async (name: string, existing: string | undefined) => {
    if (existing) {
      const code = await ethers.provider.getCode(existing);
      if (code === "0x") throw new Error(`${name} given as ${existing} but nothing is deployed there`);
      console.log(`  ${name.padEnd(19)} ${existing} (adopted, already on chain)`);
      return ethers.getContractAt(name, existing, deployer);
    }
    const deployed = await (await ethers.getContractFactory(name, deployer)).deploy(feeRecipient);
    await deployed.waitForDeployment();
    console.log(`  ${name.padEnd(19)} ${await deployed.getAddress()}`);
    return deployed;
  };

  const marketplace = await adopt("DurchexMarketplace", process.env.EXISTING_MARKETPLACE);
  const marketplaceAddress = await marketplace.getAddress();
  const escrow = await adopt("DurchexOffersEscrow", process.env.EXISTING_ESCROW);
  const escrowAddress = await escrow.getAddress();
  console.log();

  console.log("── Rewiring everything that trusts a marketplace ──");
  const rewire: [string, string, string][] = [
    ["DurchexNFT", current.DurchexNFT, "DurchexNFT"],
    ["DurchexNFT1155", current.DurchexNFT1155, "DurchexNFT1155"],
    ["DurchexCollectionFactory", current.DurchexCollectionFactory, "DurchexCollectionFactory"],
    ["DurchexCollection1155Factory", current.DurchexCollection1155Factory, "DurchexCollection1155Factory"],
  ];
  for (const [label, address, artifact] of rewire) {
    if (!address) {
      console.log(`  ${label.padEnd(30)} skipped (not deployed on this network)`);
      continue;
    }
    const contract = await ethers.getContractAt(artifact, address, deployer);
    // Skip one that is already pointed correctly, so a resumed run costs
    // nothing for the steps that already succeeded.
    if ((await contract.marketplace()).toLowerCase() === marketplaceAddress.toLowerCase()) {
      console.log(`  ${label.padEnd(30)} already -> ${marketplaceAddress}`);
      continue;
    }
    await (await contract.setMarketplace(marketplaceAddress)).wait();
    console.log(`  ${label.padEnd(30)} -> ${await contract.marketplace()}`);
  }

  console.log("\n── Redirecting the GENESIS DURX royalty ──");
  const nft1155 = current.DurchexNFT1155;
  const [reported] = await (await ethers.getContractAt("DurchexNFT1155", nft1155)).royaltyInfo(
    GENESIS_DURX_TOKEN_ID,
    ethers.parseEther("1")
  );
  console.log(`  ERC-2981 still reports ${reported} (unchangeable on this contract)`);
  await (await marketplace.setRoyaltyReceiverOverride(nft1155, GENESIS_DURX_TOKEN_ID, RESCUE_ROYALTY_RECEIVER)).wait();
  await (await escrow.setRoyaltyReceiverOverride(nft1155, GENESIS_DURX_TOKEN_ID, RESCUE_ROYALTY_RECEIVER)).wait();
  console.log(`  marketplace override ${await marketplace.royaltyReceiverOverride(nft1155, GENESIS_DURX_TOKEN_ID)}`);
  console.log(`  escrow override      ${await escrow.royaltyReceiverOverride(nft1155, GENESIS_DURX_TOKEN_ID)}`);

  if (rehearsal) {
    console.log("\n(rehearsal: deployments.json left untouched)");
  } else {
    all[key] = {
      ...current,
      DurchexMarketplace: marketplaceAddress,
      DurchexOffersEscrow: escrowAddress,
      previousDurchexMarketplace: current.DurchexMarketplace,
      previousDurchexOffersEscrow: current.DurchexOffersEscrow,
      feeRecipient,
      deployedAt: new Date().toISOString(),
    };
    writeFileSync(deploymentsPath, JSON.stringify(all, null, 2) + "\n");
  }

  const spent = balance - (await ethers.provider.getBalance(deployer.address));
  console.log(`\nSpent ${ethers.formatEther(spent)} ETH. Recorded in deployments.json.`);
  console.log("\nStill to do in the app:");
  console.log(`  MARKETPLACE_ADDRESSES[1]   = "${marketplaceAddress}"`);
  console.log(`  OFFERS_ESCROW_ADDRESSES[1] = "${escrowAddress}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
