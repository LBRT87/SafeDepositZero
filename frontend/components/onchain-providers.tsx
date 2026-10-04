"use client";

// Onchain mode only: themed RainbowKit.
import "@rainbow-me/rainbowkit/styles.css";
import { lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

const theme = lightTheme({ accentColor: "#086A4A", accentColorForeground: "#FFFFFF", borderRadius: "medium" });
theme.radii.actionButton = "10px";
theme.radii.connectButton = "10px";
theme.radii.modal = "16px";
theme.colors.modalBackground = "#FFFFFF";
theme.colors.modalText = "#14171A";
theme.fonts.body = "var(--font-hanken), system-ui, sans-serif";

export default function OnchainProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider theme={theme}>{children}</RainbowKitProvider>
    </WagmiProvider>
  );
}
