"use client";

import { ExternalLink } from "lucide-react";
import { Seal } from "./brand";
import { Skeleton } from "./ui/panel";
import { AddressTag } from "./address";
import { useTimeConfig } from "@/lib/hooks";
import { date, timeDate, term, usdg } from "@/lib/format";
import { IS_MOCK } from "@/lib/data";
import { contractsFor } from "@/config/contracts";
import { explorerAddress, PRIMARY_CHAIN } from "@/config/chains";
import type { Policy } from "@/lib/data/types";

/** Guarantee certificate; the seal stamps in once. */
export function Certificate({ policy, stamp, fee, sample }: { policy: Policy; stamp?: boolean; fee?: bigint; sample?: boolean }) {
  const monthly = fee ?? policy.monthlyPremium;
  const time = useTimeConfig();
  const fmt = (ts: number) => (ts ? (time?.profile === "demo" && !sample ? timeDate(ts) : date(ts)) : "On acceptance");
  const pm = IS_MOCK ? null : contractsFor(PRIMARY_CHAIN.id).policyManager;

  return (
    <article
      className="relative mx-auto w-full max-w-[560px] rounded-cert bg-surface p-6 shadow-cert sm:p-10"
      aria-label={`Deposit guarantee ${policy.id}`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-2 rounded-[2px] border border-line" />
      <header className="relative text-center">
        <h2 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.01em]">Deposit guarantee</h2>
        <p className="t-mono mt-1 text-muted">Policy no. {String(policy.id).padStart(6, "0")}</p>
      </header>

      <dl className="relative mt-8 grid grid-cols-1 gap-x-8 gap-y-5 text-left sm:grid-cols-2">
        <Row label="Tenant" value={<AddressTag address={policy.tenant} stacked />} />
        <Row label="Landlord" value={<AddressTag address={policy.landlord} stacked />} />
        <Row label="Property" value={policy.propertyRef} wide />
        <div className="sm:col-span-2">
          <dt className="t-small text-muted">Coverage</dt>
          <dd className="t-amount-xl mt-1 text-green-700">{usdg(policy.coverage)}</dd>
        </div>
        <Row label="Term" value={term(policy.totalPeriods, time)} />
        <Row label="Monthly fee" value={<span className="nums">{monthly > 0n ? usdg(monthly) : "Set on acceptance"}</span>} />
        <Row label="Start" value={<span className="nums">{fmt(policy.startTime)}</span>} />
        <Row label="End" value={<span className="nums">{fmt(policy.endTime)}</span>} />
      </dl>

      <footer className="relative mt-8 flex items-end justify-between gap-4 border-t border-line pt-5">
        <div className="t-small text-muted">
          <div>{PRIMARY_CHAIN.name}</div>
          {sample ? (
            <div>Sample certificate</div>
          ) : pm ? (
            <a
              href={explorerAddress(PRIMARY_CHAIN.id, pm)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline decoration-2 underline-offset-[3px]"
            >
              Verify on explorer <ExternalLink className="size-3.5" strokeWidth={1.75} />
            </a>
          ) : (
            <div>PolicyManager contract (demo data)</div>
          )}
        </div>
        {policy.status !== "Invited" && <Seal stamp={stamp} />}
      </footer>
    </article>
  );
}

function Row({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="t-small text-muted">{label}</dt>
      <dd className="mt-1 min-w-0 font-semibold">{value}</dd>
    </div>
  );
}

export function CertificateSkeleton() {
  return (
    <div aria-hidden className="relative mx-auto flex w-full max-w-[560px] flex-col items-center gap-4 rounded-cert border border-line bg-surface p-10">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-32" />
      <div className="mt-6 grid w-full grid-cols-2 gap-6">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="col-span-2 h-10" />
        <Skeleton className="col-span-2 h-12 w-2/3" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
      <Skeleton className="mt-4 size-[88px] self-end rounded-full" />
    </div>
  );
}
