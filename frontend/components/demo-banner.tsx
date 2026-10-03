"use client";

import { FastForward, RotateCcw, SlidersHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import { Popover } from "radix-ui";
import { PRIMARY_CHAIN } from "@/config/chains";
import { useEffect, useState } from "react";
import { IS_MOCK, mockControls } from "@/lib/data";
import { useSession } from "@/lib/session";
import { Banner } from "./ui/banner";
import { Button } from "./ui/button";

/** "Testnet demo · 1 minute = 1 month · Yield is simulated" + mock-only demo controls. */
export function DemoBanner() {
  return (
    <div className="border-b border-line bg-paper">
      <div className="page flex min-h-10 flex-wrap items-center justify-between gap-2 py-1.5">
        <p className="t-small text-muted">Testnet demo · 1 minute = 1 month · Yield is simulated</p>
        {IS_MOCK && <DemoControls />}
      </div>
    </div>
  );
}

function DemoControls() {
  const { wrongNetwork, setWrongNetwork } = useSession();
  const [rejectNext, setRejectNext] = useState(false);
  useEffect(() => mockControls?.subscribe(() => setRejectNext(!!mockControls?.rejectNext)), []);

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" icon={<FastForward />} onClick={() => mockControls?.skip(60)}>
        Skip 1 month
      </Button>
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button size="sm" variant="ghost" icon={<SlidersHorizontal />}>
            Demo controls
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="end" sideOffset={6} className="z-50 origin-(--radix-popover-content-transform-origin) w-80 rounded-panel border border-line bg-surface p-4 shadow-pop data-[state=closed]:animate-scale-out data-[state=open]:animate-scale-in">
            <p className="t-small text-muted">
              Mock mode. Nothing here touches a chain. State lives in this tab and resets on reload.
            </p>
            <div className="mt-3 flex flex-col gap-3">
              <Toggle
                label="Reject the next transaction in the wallet"
                checked={rejectNext}
                onChange={(v) => mockControls?.setRejectNext(v)}
              />
              <Toggle label="Pretend the wallet is on the wrong network" checked={wrongNetwork} onChange={setWrongNetwork} />
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="secondary" icon={<FastForward />} onClick={() => mockControls?.skip(15)}>
                  Skip 15 seconds
                </Button>
                <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => mockControls?.reset()}>
                  Reset demo data
                </Button>
              </div>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[15px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 accent-brand-700"
      />
      {label}
    </label>
  );
}

const SwitchNetworkButton = dynamic(() => import("./onchain-wallet").then((m) => m.SwitchNetworkButton), { ssr: false });

/** Wrong-network banner (UI brief §6). */
export function NetworkBanner() {
  const { wrongNetwork, setWrongNetwork } = useSession();
  if (!wrongNetwork) return null;
  return (
    <div className="page pt-6">
      <Banner
        tone="alert"
        action={
          IS_MOCK ? (
            <Button size="sm" onClick={() => setWrongNetwork(false)}>
              Switch to {PRIMARY_CHAIN.name}
            </Button>
          ) : (
            <SwitchNetworkButton />
          )
        }
      >
        You&apos;re on the wrong network.
      </Banner>
    </div>
  );
}
