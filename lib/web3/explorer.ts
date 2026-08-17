const EXPLORERS: Record<number, string> = {
  1: "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
  137: "https://polygonscan.com",
  80002: "https://amoy.polygonscan.com",
  8453: "https://basescan.org",
  42161: "https://arbiscan.io",
  10: "https://optimistic.etherscan.io",
  43114: "https://snowtrace.io",
  56: "https://bscscan.com",
};

export function explorerTxUrl(chainId: number, txHash: string) {
  const base = EXPLORERS[chainId];
  return base ? `${base}/tx/${txHash}` : null;
}
