import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const AMOY_RPC_URL = process.env.AMOY_RPC_URL ?? "";
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL ?? "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // OpenZeppelin v5's utils/Bytes.sol uses MCOPY (EIP-5656), only
      // available from the Cancun hardfork onward.
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    // Polygon Amoy testnet — see docs/Durchex-NFT-Marketplace-Full-Specification.pdf
    // section 18 (Deployment & Infrastructure).
    amoy: {
      url: AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 80002,
    },
    polygon: {
      url: POLYGON_RPC_URL || "https://polygon-rpc.com",
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 137,
    },
  },
};

export default config;
