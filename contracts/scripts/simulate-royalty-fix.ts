import { ethers, network } from "hardhat";

/**
 * Rehearses the GENESIS DURX royalty repair against a copy of mainnet.
 *
 * The creator wallet that minted GENESIS DURX has been delegated (EIP-7702)
 * to a contract that forwards every wei it receives to an attacker. ERC-2981
 * stamped that wallet into the token as its royalty receiver at first mint,
 * and the deployed DurchexNFT1155 has no way to change it — so every resale
 * of the collection pays the attacker 15%, permanently, with the deployed
 * contracts as they stand.
 *
 * The repair is a new DurchexMarketplace carrying a per-token royalty
 * override. This script runs the whole thing end to end on a fork: deploys
 * it, points the live NFT contract at it, sets the override, and then puts a
 * real holder's units through an actual resale to see where the money lands.
 *
 *   FORK=1 npx hardhat run scripts/simulate-royalty-fix.ts
 *
 * Nothing here touches mainnet. It only proves the sequence works before
 * anyone signs it for real.
 */
const NFT = "0xe353063FA269752F9487AF3E4af7800122a0b0a0";
const TOKEN_ID = 1787072293483n;
const OLD_MARKETPLACE = "0x42C971DAab6942f80c531675BB4Bf1cF57d30d05";
const DEPLOYER = "0xf1b1f1410D82Bb5e4bc775a6DdFba895E396314d"; // owns the NFT contract; also feeRecipient
const COMPROMISED = "0xd4B5334FAcb92faFd840dE3345ca670A70182d7B"; // current royalty receiver
const SWEEPER = "0x43b18f8fb488e30d524757d78da1438881d1aaaa"; // where it forwards to
const RESCUE = "0xb73a051F878bb7359aa384Ada61aa276898F244B"; // clean wallet the royalty should go to
const DONOR = "0xedb804e036be15b676c5a1a6f3bb56a11dd87869"; // a real holder, to source units for the test sale

const eth = (v: bigint) => `${ethers.formatEther(v)} ETH`;

async function impersonate(address: string) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [address] });
  await network.provider.send("hardhat_setBalance", [address, "0x56BC75E2D63100000"]); // 100 ETH for gas
  return ethers.getSigner(address);
}

async function main() {
  if (process.env.FORK !== "1") throw new Error("Run with FORK=1 so this executes against a mainnet copy.");

  const [seller, buyer] = await ethers.getSigners();
  const nft = await ethers.getContractAt("DurchexNFT1155", NFT);
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`Forked mainnet at block ${await ethers.provider.getBlockNumber()}\n`);

  console.log("── Before ──");
  const [reportedBefore, amtBefore] = await nft.royaltyInfo(TOKEN_ID, ethers.parseEther("1"));
  console.log(`  royaltyInfo receiver : ${reportedBefore}`);
  console.log(`  royalty rate         : ${Number(amtBefore) / 1e16}%`);
  console.log(`  that address is the compromised one: ${reportedBefore.toLowerCase() === COMPROMISED.toLowerCase()}`);
  const delegation = await ethers.provider.getCode(reportedBefore);
  console.log(`  its code             : ${delegation} (EIP-7702 delegation)`);
  console.log(`  live marketplace     : ${await nft.marketplace()}`);
  console.log(`  NFT contract owner   : ${await nft.owner()}\n`);

  // ── The repair, exactly as it would run on mainnet ──
  const deployer = await impersonate(DEPLOYER);

  console.log("── Step 1: deploy the marketplace carrying the override ──");
  const marketplace = await (await ethers.getContractFactory("DurchexMarketplace", deployer)).deploy(DEPLOYER);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`  deployed at ${marketplaceAddress}`);
  console.log(`  owner ${await marketplace.owner()}, feeRecipient ${await marketplace.feeRecipient()}\n`);

  console.log("── Step 2: point the live NFT contract at it ──");
  await (await nft.connect(deployer).setMarketplace(marketplaceAddress)).wait();
  console.log(`  nft.marketplace() = ${await nft.marketplace()}\n`);

  console.log("── Step 3: redirect this token's royalty ──");
  await (await marketplace.connect(deployer).setRoyaltyReceiverOverride(NFT, TOKEN_ID, RESCUE)).wait();
  console.log(`  override = ${await marketplace.royaltyReceiverOverride(NFT, TOKEN_ID)}\n`);

  // ── Prove it with a real resale ──
  // A mainnet holder can be impersonated but cannot sign a listing, so their
  // units are moved to a local signer that can.
  const donor = await impersonate(DONOR);
  await (await nft.connect(donor).safeTransferFrom(DONOR, seller.address, TOKEN_ID, 5, "0x")).wait();

  const pricePerUnit = ethers.parseEther("0.01");
  const quantity = 5n;
  const total = pricePerUnit * quantity;

  await (await nft.connect(seller).setApprovalForAll(marketplaceAddress, true)).wait();
  const listing = {
    nft: NFT,
    tokenId: TOKEN_ID,
    seller: seller.address,
    buyer: ethers.ZeroAddress,
    quantity,
    pricePerUnit,
    deadline: 0,
    nonce: 1,
  };
  const signature = await seller.signTypedData(
    { name: "DurchexMarketplace", version: "1", chainId, verifyingContract: marketplaceAddress },
    {
      Listing1155: [
        { name: "nft", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "seller", type: "address" },
        { name: "buyer", type: "address" },
        { name: "quantity", type: "uint256" },
        { name: "pricePerUnit", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    listing
  );

  const balances = async () => ({
    compromised: await ethers.provider.getBalance(COMPROMISED),
    sweeper: await ethers.provider.getBalance(SWEEPER),
    rescue: await ethers.provider.getBalance(RESCUE),
    fee: await ethers.provider.getBalance(DEPLOYER),
    seller: await ethers.provider.getBalance(seller.address),
  });

  console.log(`── Step 4: a real resale of ${quantity} units at ${eth(pricePerUnit)} each ──`);
  const before = await balances();
  await (await marketplace.connect(buyer).buyListed1155(listing, quantity, signature, { value: total })).wait();
  const after = await balances();

  const expectedFee = (total * 1000n) / 10000n;
  const expectedRoyalty = (total * 1500n) / 10000n;

  console.log(`  sale total           : ${eth(total)}`);
  console.log(`  platform fee         : ${eth(after.fee - before.fee)}  (expected ${eth(expectedFee)})`);
  console.log(`  royalty -> rescue    : ${eth(after.rescue - before.rescue)}  (expected ${eth(expectedRoyalty)})`);
  console.log(`  seller proceeds      : ${eth(after.seller - before.seller)}`);
  console.log(`  -> compromised wallet: ${eth(after.compromised - before.compromised)}`);
  console.log(`  -> attacker's sweeper: ${eth(after.sweeper - before.sweeper)}`);
  console.log(`  buyer received units : ${await nft.balanceOf(buyer.address, TOKEN_ID)}\n`);

  const ok =
    after.rescue - before.rescue === expectedRoyalty &&
    after.compromised === before.compromised &&
    after.sweeper === before.sweeper &&
    after.fee - before.fee === expectedFee;

  console.log(ok ? "PASS — the royalty reaches the clean wallet and the attacker gets nothing." : "FAIL");
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
