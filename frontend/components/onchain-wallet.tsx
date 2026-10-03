"use client";

// Onchain mode only (loaded lazily): the RainbowKit connect button, styled as the brief's white wallet button,
// plus the bridge that pushes the connected account and network into the session.
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDown, Wallet } from "lucide-react";
import { useEffect } from "react";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { setWalletClient } from "@/lib/wallet-bridge";
import { PRIMARY_CHAIN } from "@/config/chains";
import { useUsdgBalance } from "@/lib/hooks";
import { money, shortAddress } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button } from "./ui/button";

function WalletBridge() {
  const { address, chainId, isConnected } = useAccount();
  const { setOnchainAccount, setWrongNetwork } = useSession();
  const { data: walletClient } = useWalletClient();
  useEffect(() => {
    setWalletClient(walletClient ?? null);
  }, [walletClient]);
  useEffect(() => {
    setOnchainAccount(address ?? null);
    setWrongNetwork(isConnected && chainId !== PRIMARY_CHAIN.id);
  }, [address, chainId, isConnected, setOnchainAccount, setWrongNetwork]);
  return null;
}

export default function OnchainWallet() {
  const { account } = useSession();
  const { data: balance } = useUsdgBalance(account);
  return (
    <>
      <WalletBridge />
      <ConnectButton.Custom>
        {({ account: acct, mounted, openConnectModal, openAccountModal }) => {
          const connected = mounted && !!acct;
          return (
            <button
              onClick={connected ? openAccountModal : openConnectModal}
              className="inline-flex h-10 items-center gap-2 rounded-btn border border-line-strong bg-surface px-3 text-[15px] font-semibold text-ink transition-colors duration-150 hover:bg-hover"
            >
              <Wallet className="size-[18px]" strokeWidth={1.75} aria-hidden />
              {connected ? (
                <>
                  <span className="t-mono hidden sm:inline">{shortAddress(acct.address)}</span>
                  <span className="nums hidden min-[420px]:inline">{balance !== undefined ? money(balance) : "…"}</span>
                  <ChevronDown className="size-4" strokeWidth={1.75} aria-hidden />
                </>
              ) : (
                <span>Connect wallet</span>
              )}
            </button>
          );
        }}
      </ConnectButton.Custom>
    </>
  );
}

export function SwitchNetworkButton() {
  const { switchChain, isPending } = useSwitchChain();
  return (
    <Button size="sm" loading={isPending} loadingText="Switching…" onClick={() => switchChain({ chainId: PRIMARY_CHAIN.id })}>
      Switch to {PRIMARY_CHAIN.name}
    </Button>
  );
}
