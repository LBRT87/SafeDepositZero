"use client";

// wagmi config, onchain mode only.
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { PRIMARY_CHAIN, READ_RPC_URL } from "@/config/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "SafeDeposit Zero",
  // Optional; set in env.
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "safedeposit-zero-demo",
  chains: [PRIMARY_CHAIN],
  transports: { [PRIMARY_CHAIN.id]: http(READ_RPC_URL) },
  ssr: true,
});
