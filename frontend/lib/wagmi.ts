"use client";

// Shared wagmi config. Imported only in onchain mode (providers load lazily, onchain.ts imports it on demand).
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { PRIMARY_CHAIN, READ_RPC_URL } from "@/config/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "SafeDeposit Zero",
  // Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local (never commit it).
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "safedeposit-zero-demo",
  chains: [PRIMARY_CHAIN],
  transports: { [PRIMARY_CHAIN.id]: http(READ_RPC_URL) },
  ssr: true,
});
