import type { WalletClient } from "viem";

// Wallet client from onchain-wallet.tsx; keeps wagmi out of server code.
let current: WalletClient | null = null;

export function setWalletClient(client: WalletClient | null) {
  current = client;
}

export function getWalletClient(): WalletClient {
  if (!current) throw new Error("Connect your wallet first.");
  return current;
}
