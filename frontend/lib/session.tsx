"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { PRIMARY_CHAIN } from "@/config/chains";
import { dataSource, IS_MOCK } from "./data";
import type { Address, DemoWallet, Role } from "./data/types";

interface Session {
  /** Connected wallet (onchain) or the active demo wallet (mock). */
  account: Address | null;
  wallet: DemoWallet | null;
  /** Role implied by the current page. */
  pageRole: Role | null;
  /** Mock: pick which demo wallet to act as on this page (null = the page's default persona). */
  setDemoWallet: (address: Address | null) => void;
  wrongNetwork: boolean;
  setWrongNetwork: (v: boolean) => void;
  chainName: string;
  /** Onchain bridge pushes the wagmi account here. */
  setOnchainAccount: (a: Address | null) => void;
}

const Ctx = createContext<Session | null>(null);

export function roleForPath(pathname: string): Role | null {
  if (pathname.startsWith("/tenant") || pathname.startsWith("/invite")) return "tenant";
  if (pathname.startsWith("/landlord")) return "landlord";
  if (pathname.startsWith("/invest")) return "investor";
  if (pathname.startsWith("/arbiter")) return "arbiter";
  if (pathname.startsWith("/admin")) return "admin";
  return null;
}

/** Mock: the persona each page opens with. Invite links open as a new renter, so the demo shows tier B. */
function defaultWallet(pathname: string, wallets: DemoWallet[]): DemoWallet | null {
  const role = roleForPath(pathname);
  if (pathname.startsWith("/invite")) return wallets.find((w) => w.name.includes("new renter")) ?? null;
  return wallets.find((w) => w.role === role) ?? null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const pageRole = roleForPath(pathname);
  const [override, setOverride] = useState<{ page: string; address: Address | null } | null>(null);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [onchainAccount, setOnchainAccount] = useState<Address | null>(null);

  const value = useMemo<Session>(() => {
    let wallet: DemoWallet | null = null;
    let account: Address | null = null;
    if (IS_MOCK) {
      const wallets = dataSource.getDemoWallets();
      const picked = override && override.page === pathname && override.address;
      wallet = (picked && wallets.find((w) => w.address === picked)) || defaultWallet(pathname, wallets);
      account = wallet?.address ?? null;
    } else {
      account = onchainAccount;
    }
    return {
      account,
      wallet,
      pageRole,
      setDemoWallet: (address) => setOverride({ page: pathname, address }),
      wrongNetwork,
      setWrongNetwork,
      chainName: PRIMARY_CHAIN.name,
      setOnchainAccount,
    };
  }, [override, pathname, pageRole, wrongNetwork, onchainAccount]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
