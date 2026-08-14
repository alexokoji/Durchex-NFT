// Server-safe production chain IDs. Keep this file free of wagmi/RainbowKit
// imports: API routes execute on the server during `next build`.
export const SUPPORTED_EVM_CHAIN_IDS = [1, 8453, 137, 42161, 10, 43114, 56, 999] as const;
