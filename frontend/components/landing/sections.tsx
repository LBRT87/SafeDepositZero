"use client";

import { clsx } from "clsx";
import { Certificate } from "../certificate";
import { useInView } from "./motion";
import type { Address, Policy } from "@/lib/data/types";

// How it works

const STEPS = [
  { title: "Your landlord sends an invite.", body: "They set the deposit they'd normally ask for." },
  { title: "You pay a small monthly fee.", body: "Your landlord is now guaranteed up to that amount." },
  { title: "You move out.", body: "Your landlord has 7 days to report damage, with photos." },
  {
    title: "It settles.",
    body: "No claim, nothing to do. A fair claim is paid by the pool right away, and you repay it in installments.",
  },
];

/** Steps with a rule drawn in order. */
export function HowItWorks() {
  const { ref, waiting } = useInView<HTMLOListElement>(0.35);
  return (
    <ol ref={ref} className="relative mt-10 grid grid-cols-1 gap-8 md:grid-cols-4 md:gap-6">
      <span aria-hidden className="absolute left-4 top-4 hidden h-0.5 w-[calc(100%-2rem)] bg-line md:block" />
      <span
        aria-hidden
        data-state={waiting ? "waiting" : "in"}
        className="grow-x absolute left-4 top-4 hidden h-0.5 w-[calc(100%-2rem)] bg-brand-500 [transition-duration:1200ms] md:block"
      />
      <span aria-hidden className="absolute bottom-4 left-4 top-4 w-0.5 bg-line md:hidden" />
      {STEPS.map((s, i) => (
        <li
          key={s.title}
          data-state={waiting ? "waiting" : "in"}
          className="reveal relative flex gap-4 md:flex-col"
          style={{ transitionDelay: waiting ? "0ms" : `${i * 220}ms` }}
        >
          <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[15px] font-semibold text-white nums ring-4 ring-paper">
            {i + 1}
          </span>
          <div>
            <h3 className="text-[17px] font-semibold leading-6">{s.title}</h3>
            <p className="mt-1 text-muted">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// What the landlord gets

const SAMPLE: Policy = {
  id: 1204,
  landlord: "0x1F4d8c2E6a9B3f7D5e1C0b4A8d2F6e9C3a7Ba92C" as Address,
  tenant: "0x7a3E9b2C4d1F8a6B5e0D3c2A1f9E8d7C6b5A4f31" as Address,
  propertyRef: "Unit 12B, Orchard",
  monthlyRent: 2_000_000_000n,
  coverage: 2_000_000_000n,
  monthlyPremium: 15_000_000n,
  startTime: 1_759_449_600,
  endTime: 1_790_985_600,
  nextPremiumDue: 0,
  lapsedAt: 0,
  periodsPaid: 1,
  totalPeriods: 12,
  tier: "B",
  status: "Active",
  checkInCid: "",
  checkInEvidenceHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  tenantCheckInCid: "",
  tenantCheckInHash: null,
  claimWindowEnd: 0,
  claimId: null,
  createdAt: 0,
  activatedTx: null,
};

const LANDLORD_POINTS = [
  { title: "Covered up to the full deposit", body: "The amount you'd normally hold, guaranteed by a pool that keeps at least 50% in reserve." },
  { title: "Paid within minutes of approval", body: "Accepted and approved claims are paid straight from the pool. You don't chase the tenant." },
  { title: "A record nobody can rewrite", body: "Check-in photos, the tenant's move-in notes and every decision are pinned to IPFS and fingerprinted on-chain." },
];

/** Sample certificate; the seal stamps in on view. */
export function LandlordGets() {
  const { ref, waiting, inView } = useInView<HTMLDivElement>(0.45);
  return (
    <div ref={ref} className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,560px)_1fr] lg:gap-16">
      <div data-state={waiting ? "waiting" : "in"} className="reveal">
        <Certificate policy={SAMPLE} stamp={inView} sample />
      </div>
      <div>
        <h2 className="t-h2">Your landlord gets a guarantee, not a promise.</h2>
        <dl className="mt-8 flex flex-col gap-6">
          {LANDLORD_POINTS.map((p, i) => (
            <div
              key={p.title}
              data-state={waiting ? "waiting" : "in"}
              className="reveal border-l border-line-strong pl-5"
              style={{ transitionDelay: waiting ? "0ms" : `${200 + i * 90}ms` }}
            >
              <dt className="font-semibold">{p.title}</dt>
              <dd className="mt-1 text-muted measure">{p.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

// Where the yield comes from

/** Illustrative: 1,000 × $2,000 leases, $1M pool. */
const YIELD_LINES = [
  { label: "Tenant fees to the pool (75%)", value: 135_000, kind: "in" as const },
  { label: "T-bill yield on capital above the liquidity target", value: 20_400, kind: "in" as const },
  { label: "USDG partner rewards on idle cash", value: 12_000, kind: "in" as const },
  { label: "Claims paid, after tenant repayments", value: -63_000, kind: "out" as const },
];
const NET = YIELD_LINES.reduce((a, l) => a + l.value, 0);
const SCALE = 135_000;

/** Yield sources vs claims, one scale. */
export function YieldBars() {
  const { ref, waiting } = useInView<HTMLDivElement>(0.3);
  const usd = (v: number) => `${v < 0 ? "−" : "+"}$${Math.abs(v).toLocaleString("en-US")}`;
  return (
    <div ref={ref}>
      <table className="w-full border-collapse">
        <caption className="sr-only">Illustrative yearly yield for a $1M pool backing 1,000 leases of $2,000</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Per year</th>
          </tr>
        </thead>
        <tbody>
          {YIELD_LINES.map((l, i) => (
            <tr key={l.label} className="border-b border-line" title={`${l.label}: ${usd(l.value)} a year`}>
              <th scope="row" className="py-3.5 pr-4 text-left align-top font-normal">
                <span className="block">{l.label}</span>
                <span aria-hidden className="mt-2 block h-2 rounded-full bg-ghost">
                  <span
                    data-state={waiting ? "waiting" : "in"}
                    className={clsx("grow-x block h-full rounded-full", l.kind === "in" ? "bg-brand-500" : "bg-graphite-700")}
                    style={{ width: `${(Math.abs(l.value) / SCALE) * 100}%`, transitionDelay: waiting ? "0ms" : `${i * 120}ms` }}
                  />
                </span>
              </th>
              <td className={clsx("nums whitespace-nowrap py-3.5 text-right align-top font-semibold", l.kind === "in" ? "text-green-700" : "text-ink")}>
                {usd(l.value)}
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="pt-4 text-left font-semibold">
              Left for investors
            </th>
            <td className="t-amount-l pt-4 text-right text-green-700">
              {usd(NET)} <span className="t-small font-semibold">≈ 10.4% APY</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="t-small mt-4 text-muted measure">
        Illustrative, not a forecast: 1,000 leases of $2,000 on a $1M pool, claims at 35% of fees after repayments. Rewards
        and T-bill yield are simulated on testnet.
      </p>
    </div>
  );
}
