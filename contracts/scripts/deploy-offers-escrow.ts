import { ethers, network } from "hardhat";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Deploys DurchexOffersEscrow — offers denominated in native ETH, held by
 * the contract until a holder accepts or the buyer withdraws.
 *
 * Additive. The existing DurchexOffers stays deployed and untouched so
 * anything already signed against it keeps whatever validity it had; this
 * simply becomes where new offers go.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS || deployer.address;
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`Network:       ${network.name} (chainId ${chainId})`);
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`Balance:       ${ethers.formatEther(balance)} ETH`);
  console.log(`Fee recipient: ${feeRecipient}\n`);

  const Escrow = await ethers.getContractFactory("DurchexOffersEscrow");

  // Priced before sending rather than after, so a gas spike shows up as a
  // number to reconsider instead of a surprise on the receipt.
  const deployTx = await Escrow.getDeployTransaction(feeRecipient);
  const gas = await ethers.provider.estimateGas({ ...deployTx, from: deployer.address });
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
  console.log(`Estimated gas: ${gas.toString()} @ ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`Estimated cost: ${ethers.formatEther(gas * gasPrice)} ETH\n`);

  const escrow = await Escrow.deploy(feeRecipient);
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();
  const receipt = await escrow.deploymentTransaction()?.wait();

  console.log(`DurchexOffersEscrow: ${address}`);
  console.log(`Gas used:            ${receipt?.gasUsed?.toString()}`);
  console.log(`Actual cost:         ${ethers.formatEther((receipt?.gasUsed ?? 0n) * (receipt?.gasPrice ?? 0n))} ETH`);

  const file = join(__dirname, "..", "deployments.json");
  const all = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  all[network.name] = { ...(all[network.name] ?? {}), chainId, DurchexOffersEscrow: address };
  writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`);
  console.log(`\nRecorded in deployments.json under "${network.name}".`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
