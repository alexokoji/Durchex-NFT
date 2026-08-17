// Server-safe production chain IDs. Keep this file free of wagmi/RainbowKit
// imports: API routes execute on the server during `next build`.
// 11155111 (Ethereum Sepolia) is included because it's currently the only
// network with real deployed contracts (contracts/deployments.json) — remove
// it here once mainnet has a real deployment and Sepolia is dev-only again.
export const SUPPORTED_EVM_CHAIN_IDS = [1, 8453, 137, 42161, 10, 43114, 56, 999, 11155111] as const;
