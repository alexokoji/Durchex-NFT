import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const AMOY_RPC_URL = process.env.AMOY_RPC_URL ?? "";
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL ?? "";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL ?? "";
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL ?? "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? "";

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
    // Ethereum Sepolia testnet — deploy and verify here first, no real funds at risk.
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    // Ethereum mainnet — real ETH, real gas. Only run `npm run deploy:mainnet`
    // after a full Sepolia dry run.
    mainnet: {
      url: MAINNET_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 1,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};

export default config;
