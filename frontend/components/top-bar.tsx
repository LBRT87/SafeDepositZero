"use client";

import { clsx } from "clsx";
import { ChevronDown, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Popover } from "radix-ui";
import { Wordmark } from "./brand";
import { dataSource, IS_MOCK } from "@/lib/data";
import { useUsdgBalance } from "@/lib/hooks";
import { money, shortAddress } from "@/lib/format";
import { roleForPath, useSession } from "@/lib/session";
import type { Role } from "@/lib/data/types";
import { PRIMARY_CHAIN } from "@/config/chains";

const OnchainWallet = dynamic(() => import("./onchain-wallet"), {
  ssr: false,
  loading: () => (
    <span className="inline-flex h-10 items-center rounded-btn border border-line-strong bg-surface px-3 text-[15px] font-semibold text-ink">
      Connect wallet
    </span>
  ),
});

export const ROLE_TABS: { role: Role; label: string; href: string }[] = [
  { role: "tenant", label: "Tenant", href: "/tenant" },
  { role: "landlord", label: "Landlord", href: "/landlord" },
  { role: "investor", label: "Investor", href: "/invest" },
  { role: "arbiter", label: "Arbiter", href: "/arbiter" },
  { role: "admin", label: "Admin", href: "/admin" },
];

export function TopBar() {
  const pathname = usePathname() ?? "/";
  const active = roleForPath(pathname);
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-line bg-surface text-ink">
      <div className="page flex h-full items-center justify-between gap-4">
        <Link href="/" className="rounded-btn" aria-label="SafeDeposit Zero home">
          <Wordmark />
        </Link>
        <nav aria-label="Roles" className="hidden h-full items-stretch gap-1 md:flex">
          {ROLE_TABS.map((t) => (
            <Link
              key={t.role}
              href={t.href}
              aria-current={active === t.role ? "page" : undefined}
              className={clsx(
                "flex items-center border-b-[3px] px-3 text-[15px] font-semibold transition-colors duration-200",
                active === t.role
                  ? "border-accent-500 text-ink"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden h-8 items-center gap-1.5 rounded-full bg-ghost px-3 text-[13px] font-semibold text-ink sm:inline-flex">
            <span aria-hidden className="size-1.5 rounded-full bg-brand-500" />
            {PRIMARY_CHAIN.name}
          </span>
          {IS_MOCK ? <DemoWalletButton /> : <OnchainWallet />}
        </div>
      </div>
    </header>
  );
}

function DemoWalletButton() {
  const { wallet, account, setDemoWallet } = useSession();
  const { data: balance } = useUsdgBalance(account);
  const wallets = dataSource.getDemoWallets();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-btn border border-line-strong bg-surface px-3 text-[15px] font-semibold text-ink transition-colors duration-150 hover:bg-hover">
          <Wallet className="size-[18px]" strokeWidth={1.75} aria-hidden />
          {account ? (
            <>
              <span className="t-mono hidden sm:inline">{shortAddress(account)}</span>
              <span className="nums hidden min-[420px]:inline">{balance !== undefined ? money(balance) : "…"}</span>
            </>
          ) : (
            <span>Demo wallet</span>
          )}
          <ChevronDown className="size-4" strokeWidth={1.75} aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 origin-(--radix-popover-content-transform-origin) w-72 rounded-panel border border-line bg-surface p-2 text-ink shadow-pop data-[state=closed]:animate-scale-out data-[state=open]:animate-scale-in"
        >
          <p className="t-small px-2 pb-2 pt-1 text-muted">
            Demo wallets. Each page opens with its own role; pick another to see what a different wallet sees.
          </p>
          {wallets.map((w) => (
            <button
              key={w.address}
              onClick={() => setDemoWallet(w.address)}
              className={clsx(
                "flex w-full items-center justify-between gap-3 rounded-btn px-2 py-2 text-left hover:bg-hover",
                wallet?.address === w.address && "bg-brand-50 hover:bg-brand-50",
              )}
            >
              <span>
                <span className="block text-[15px] font-semibold">{w.name}</span>
                <span className="t-small text-muted capitalize">{w.role}</span>
              </span>
              <span className="t-mono text-muted">{shortAddress(w.address)}</span>
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Mobile: role tabs move to a bottom segmented control. */
export function MobileRoleNav() {
  const pathname = usePathname() ?? "/";
  const active = roleForPath(pathname);
  return (
    <nav
      aria-label="Roles"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 md:hidden"
    >
      <div className="grid grid-cols-5 gap-1 rounded-btn bg-ghost p-1">
        {ROLE_TABS.map((t) => (
          <Link
            key={t.role}
            href={t.href}
            aria-current={active === t.role ? "page" : undefined}
            className={clsx(
              "flex h-9 items-center justify-center rounded-[8px] text-[13px] font-semibold",
              active === t.role ? "bg-brand-700 text-white" : "text-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
