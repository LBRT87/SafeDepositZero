import type { WalletClient } from "viem";

// The connected wallet client, handed over by components/onchain-wallet.tsx (client-only). Keeps wagmi and
// RainbowKit out of anything that also renders on the server, like lib/data/onchain.ts.
let current: WalletClient | null = null;

export function setWalletClient(client: WalletClient | null) {
  current = client;
}

export function getWalletClient(): WalletClient {
  if (!current) throw new Error("Connect your wallet first.");
  return current;
}
