"use client";

import { clsx } from "clsx";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DepositWithdraw } from "@/components/invest/deposit-withdraw";
import { SharePriceChart } from "@/components/invest/share-price-chart";
import { ExplorerLink } from "@/components/explorer-link";
import { ReserveMeter } from "@/components/reserve-meter";
import { Banner } from "@/components/ui/banner";
import { PageHeader, Panel, Skeleton } from "@/components/ui/panel";
import { DataTable } from "@/components/ui/table";
import { dataSource } from "@/lib/data";
import { useDS } from "@/lib/hooks";
import { money, moneyShort, pct, pctFromRatio, timeDate } from "@/lib/format";
import type { ActivityEntry } from "@/lib/data/types";

const KIND: Record<ActivityEntry["kind"], { label: string; sign: "+" | "−" | ""; tone: "green" | "alert" | "muted" }> = {
  premium: { label: "Premium in", sign: "+", tone: "green" },
  repayment: { label: "Repayment in", sign: "+", tone: "green" },
  yield: { label: "T-bill yield", sign: "+", tone: "green" },
  rewards: { label: "USDG rewards", sign: "+", tone: "green" },
  firstLoss: { label: "First-loss cover", sign: "+", tone: "green" },
  claim: { label: "Claim out", sign: "−", tone: "alert" },
  deposit: { label: "Deposit", sign: "", tone: "muted" },
  withdraw: { label: "Withdrawal", sign: "", tone: "muted" },
  rebalance: { label: "Rebalance", sign: "", tone: "muted" },
};

/** SPEC §4.4: 1,000 policies × $2,000 coverage, $1M pool. Illustrative, not a forecast. */
const SCENARIOS = [
  { name: "Normal year", claims: "−$63,000", result: "+$104,400", pct: "+10.4%", price: "1.000 → 1.104", tone: "green" as const },
  { name: "Bad year", claims: "−$180,000", result: "−$12,600", pct: "−1.3%", price: "1.000 → 0.987", tone: "alert" as const },
  { name: "Disaster", claims: "−$600,000", result: "−$432,600", pct: "−43.3%", price: "1.000 → 0.567", tone: "alert" as const },
];

export default function InvestPage() {
  const { data: s, isError } = useDS(["pool"], () => dataSource.getPoolStats(), { refetchInterval: 5_000 });
  const { data: activity } = useDS(["activity"], () => dataSource.getPoolActivity());
  const [showAll, setShowAll] = useState(false);
  const { data: history } = useDS(["sharePrice"], () => dataSource.getSharePriceHistory(), { refetchInterval: 10_000 });

  return (
    <div className="page flex flex-col gap-8">
      <PageHeader title="The guarantee pool" subtitle="Deposit USDG to back rental guarantees and earn from fees and treasuries." />

      {isError && <Banner tone="alert">We couldn&apos;t load the pool. Check your connection and refresh the page.</Banner>}
      {s?.paused && <Banner tone="alert">New guarantees and deposits are paused by the protocol admin. Claims, repayments and free withdrawals still work.</Banner>}
      {s && s.reserveRatioBps !== null && s.reserveRatioBps < s.minReserveBps && (
        <Banner tone="alert">The pool is below its minimum reserve, so new guarantees are paused until new deposits arrive.</Banner>
      )}

      {/* Summary: one panel split by vertical rules, not cards */}
      <section className="rounded-panel border border-line bg-surface">
        <dl className="grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x [&>div]:px-5 [&>div]:py-5 md:[&>div]:px-6">
          <Summary label="Pool assets" value={s && moneyShort(s.totalAssets)} sub={s && `Share price $${s.sharePrice.toFixed(4)}`} />
          <Summary label="Active coverage" value={s && moneyShort(s.activeCoverage)} sub={s && `${s.activeGuarantees} guarantees`} />
          <Summary label="Utilization" value={s && pct(s.utilizationBps)} sub="Coverage ÷ assets, max 200%" />
          <Summary label="Net APY" value={s && pctFromRatio(s.apy.netApy)} sub="Last 12 months" tone="green" />
        </dl>
      </section>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_440px]">
        <div className="flex min-w-0 flex-col gap-8">
          <Panel title="Reserve">
            {s ? <ReserveMeter ratioBps={s.reserveRatioBps} minBps={s.minReserveBps} /> : <Skeleton className="h-24" />}
            {s && (
              <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 border-t border-line pt-5 sm:grid-cols-2">
                <Figure label="Ready for instant claim payouts" value={money(s.idleAssets)} />
                <Figure label="In tokenized T-bills (simulated)" value={money(s.adapterValue)} />
                <Figure
                  label="First-loss reserve"
                  value={money(s.firstLossBalance)}
                  note="Funded by 10% of every fee. Pays defaults before investors lose anything. Not part of your share price."
                />
                <Figure
                  label="Pending claims"
                  value={s.pendingClaims > 0n ? `−${money(s.pendingClaims)}` : money(0n)}
                  tone={s.pendingClaims > 0n ? "alert" : undefined}
                  note="Claims waiting for a decision already count against the share price, so withdrawing now can't escape them."
                />
              </dl>
            )}
          </Panel>

          <Panel id="apy" title="Where the yield comes from" description="Yield comes from rent fees, USDG rewards and treasuries, not token emissions.">
            {s ? (
              <>
                <table className="w-full border-collapse">
                  <caption className="sr-only">APY breakdown</caption>
                  <tbody>
                    <Line label="Premium income (75% of every fee)" value={s.apy.premiumsToPool} tone="green" />
                    <Line label="USDG partner rewards on idle cash (simulated)" value={s.apy.gdnRewards} tone="green" />
                    <Line label="T-bill yield (simulated)" value={s.apy.tbillYield} tone="green" />
                    <Line label="Recoveries (tenant repayments)" value={s.apy.recoveries} tone="green" />
                    <Line label="First-loss covers of defaults" value={s.apy.firstLossCovers} tone="green" />
                    <Line label="Claims paid" value={-s.apy.claimsPaid} tone="alert" />
                    <tr className="h-12 border-t-2 border-ink">
                      <th scope="row" className="text-left font-semibold">Net APY</th>
                      <td className="t-amount-l text-right text-green-700">{pctFromRatio(s.apy.netApy)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="t-small mt-4 text-muted measure">
                  Net APY = (premium income + USDG rewards + T-bill yield + recoveries + first-loss covers − claims paid) ÷
                  average pool assets, annualized over the last {Math.round(s.apy.periodMonths)} months. Demo time: 1 minute =
                  1 month. Rewards and T-bill yield are simulated on testnet.
                </p>
              </>
            ) : (
              <Skeleton className="h-64" />
            )}
          </Panel>

          <Panel
            title="What can go wrong"
            description="Your capital pays valid claims. Tenants repay the pool over time; repayments can be late."
          >
            <DataTable
              caption="Illustrative scenarios for a $1M pool backing 1,000 leases of $2,000"
              rows={SCENARIOS}
              rowKey={(r) => r.name}
              columns={[
                { header: "Scenario", cell: (r) => <span className="font-semibold">{r.name}</span> },
                { header: "Net claims", align: "right", cell: (r) => <span className="nums">{r.claims}</span> },
                {
                  header: "Investor result",
                  align: "right",
                  cell: (r) => (
                    <span className={clsx("nums font-semibold", r.tone === "green" ? "text-green-700" : "text-alert")}>
                      {r.result} ({r.pct})
                    </span>
                  ),
                },
                { header: "Share price", align: "right", cell: (r) => <span className="nums">{r.price}</span>, hideOnMobile: true },
              ]}
            />
            <ul className="t-small mt-5 flex flex-col gap-1.5 text-muted measure">
              <li>Illustrative only, not a forecast. Investors lose money only once net claims pass about 93% of premiums.</li>
              <li>The most you can lose is what you deposited. You&apos;re never billed for more.</li>
              <li>The first-loss reserve covers tenant defaults before investors do.</li>
            </ul>
          </Panel>

          <Panel title="Share price">
            {history ? <SharePriceChart points={history} /> : <Skeleton className="h-44" />}
          </Panel>
        </div>

        <div className="lg:sticky lg:top-24">
          <DepositWithdraw stats={s} />
        </div>
      </div>

      <Panel title="Activity" description="Every premium, claim, reward and repayment, read from on-chain events.">
        <DataTable
          caption="Pool activity"
          loading={!activity}
          rows={showAll ? activity : activity?.slice(0, 12)}
          rowKey={(a) => a.id}
          columns={[
            { header: "When", cell: (a) => <span className="nums">{timeDate(a.at)}</span> },
            { header: "Type", cell: (a) => <span className="font-semibold">{KIND[a.kind].label}</span> },
            { header: "Detail", wrap: true, cell: (a) => <span className="text-muted">{a.label}</span> },
            {
              header: "Amount",
              align: "right",
              cell: (a) => (
                <span
                  className={clsx(
                    "font-semibold",
                    KIND[a.kind].tone === "green" && "text-green-700",
                    KIND[a.kind].tone === "alert" && "text-alert",
                  )}
                >
                  {KIND[a.kind].sign}
                  {money(a.amount)}
                </span>
              ),
            },
            { header: "Tx", cell: (a) => <ExplorerLink hash={a.txHash} />, hideOnMobile: true },
          ]}
        />
        {activity && activity.length > 12 && (
          <Button variant="ghost" size="sm" className="mt-4" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show the latest 12" : `Show all ${activity.length} entries`}
          </Button>
        )}
      </Panel>
    </div>
  );
}

function Summary({ label, value, sub, tone }: { label: string; value?: string | null; sub?: string | null; tone?: "green" }) {
  return (
    <div className="min-w-0">
      <dt className="t-small text-muted">{label}</dt>
      <dd className={clsx("nums mt-1 text-[24px] font-semibold leading-[30px] tracking-[-0.01em] md:text-[40px] md:font-bold md:leading-[44px] md:tracking-[-0.02em]", tone === "green" && "text-green-700")}>
        {value ?? <Skeleton className="h-8 w-28" />}
      </dd>
      {sub && <dd className="t-small mt-1 text-muted">{sub}</dd>}
    </div>
  );
}

function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "alert" }) {
  return (
    <div className="min-w-0">
      <dt className="t-small text-muted">{label}</dt>
      <dd className={clsx("nums mt-1 font-semibold", tone === "alert" && "text-alert")}>{value}</dd>
      {note && <dd className="t-small mt-1 text-muted">{note}</dd>}
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: bigint; tone: "green" | "alert" }) {
  const neg = value < 0n;
  return (
    <tr className="h-12 border-b border-line">
      <th scope="row" className="pr-4 text-left font-normal">
        {label}
      </th>
      <td className={clsx("nums text-right font-semibold", tone === "green" ? "text-green-700" : "text-alert")}>
        {neg ? "−" : "+"}
        {money(neg ? -value : value)}
      </td>
    </tr>
  );
}
