"use client";

import { FastForward } from "lucide-react";
import { useId, useState } from "react";
import { AddressTag } from "@/components/address";
import { TxAction } from "@/components/tx-action";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { PageHeader, Panel, Skeleton } from "@/components/ui/panel";
import { dataSource, IS_MOCK, mockControls } from "@/lib/data";
import { useDS } from "@/lib/hooks";
import { parseAmount, pct, usdg } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { AdminParams, ParamKey } from "@/lib/data/types";

type Unit = "bps" | "usdg";

/** Contract setter bounds. */
const PARAMS: { key: ParamKey; label: string; help: string; unit: Unit; min: bigint; max: bigint }[] = [
  { key: "protocolFeeBps", label: "Protocol fee", help: "Share of each monthly fee kept by SafeDeposit Zero.", unit: "bps", min: 0n, max: 4_000n },
  { key: "firstLossShareBps", label: "First-loss share of the fee", help: "Part of the protocol fee sent to the first-loss reserve.", unit: "bps", min: 0n, max: 10_000n },
  { key: "firstLossCapBps", label: "First-loss cap", help: "The reserve stops filling at this share of pool assets.", unit: "bps", min: 0n, max: 2_000n },
  { key: "minReserveBps", label: "Minimum reserve", help: "Pool assets ÷ active coverage. Below it, new guarantees stop.", unit: "bps", min: 3_000n, max: 10_000n },
  { key: "liquidityTargetBps", label: "Liquidity target", help: "Kept idle for instant payouts; the rest goes to T-bills.", unit: "bps", min: 500n, max: 10_000n },
  { key: "maxLandlordShareBps", label: "Max share per landlord", help: "Most of the pool's capacity one landlord can use.", unit: "bps", min: 100n, max: 10_000n },
  { key: "concentrationFloor", label: "Concentration floor", help: "Every landlord can always use at least this much.", unit: "usdg", min: 0n, max: 1_000_000_000_000n },
  { key: "maxCoveragePerPolicy", label: "Max deposit per lease", help: "Largest deposit one guarantee can cover.", unit: "usdg", min: 1_000_000n, max: 100_000_000_000n },
  { key: "disputeFeeBps", label: "Dispute fee", help: "Of the claimed amount, minimum 10 USDG, only on full approval.", unit: "bps", min: 0n, max: 1_000n },
  { key: "gdnAprBps", label: "USDG rewards rate (simulated)", help: "Testnet stand-in for Global Dollar Network rewards.", unit: "bps", min: 0n, max: 2_000n },
];

export default function AdminPage() {
  const { account } = useSession();
  const { data: params, isError } = useDS(["adminParams"], () => dataSource.getAdminParams());
  const { data: isAdmin } = useDS(["isAdmin", account], () => dataSource.hasAdminRole(account!), { enabled: !!account });
  const { data: pool } = useDS(["pool"], () => dataSource.getPoolStats(), { refetchInterval: 5_000 });
  const notAdmin = !account ? "Connect your wallet first" : isAdmin === false ? "Only the protocol admin can do this" : null;

  return (
    <div className="page flex flex-col gap-8">
      <PageHeader
        title="Protocol settings"
        subtitle="Change bounded parameters, pause new business, and run the keeper steps anyone can run."
      />

      {account && isAdmin === false && (
        <Banner tone="info">
          This wallet isn&apos;t the protocol admin. You can read every setting; the keeper actions below work from any wallet.
        </Banner>
      )}
      {isError && <Banner tone="alert">We couldn&apos;t load the settings. Check your connection and refresh the page.</Banner>}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_400px]">
        <Panel title="Parameters" description="Every change is bounded by the contract and emits ParamsUpdated.">
          {params ? (
            <ul className="flex flex-col divide-y divide-line">
              {PARAMS.map((p) => (
                <ParamRow key={p.key} spec={p} current={params[p.key]} blocked={notAdmin} />
              ))}
            </ul>
          ) : (
            <Skeleton className="h-96" />
          )}
        </Panel>

        <div className="flex flex-col gap-8">
          <Panel
            title="New business"
            actions={params ? params.paused ? <Badge tone="alert">Paused</Badge> : <Badge tone="green">Open</Badge> : undefined}
          >
            {params ? (
              <>
                <p className="text-muted">
                  {params.paused
                    ? "New invites, acceptances and deposits are paused. Claims, repayments, the queue and free withdrawals keep working."
                    : "Pausing stops new invites, acceptances and deposits. Claims, repayments, the queue and free withdrawals keep working."}
                </p>
                <div className="mt-5">
                  <TxAction
                    label={params.paused ? "Resume new business" : "Pause new business"}
                    variant={params.paused ? "primary" : "destructive"}
                    successTitle={params.paused ? "New business resumed" : "New business paused"}
                    disabledReason={notAdmin}
                    run={(opts) => dataSource.setPaused(!params.paused, opts)}
                  />
                </div>
                <dl className="mt-6 border-t border-line pt-5">
                  <dt className="t-small text-muted">Treasury (receives SafeDeposit Zero&apos;s share)</dt>
                  <dd className="mt-1 font-semibold">
                    <AddressTag address={params.treasury} />
                  </dd>
                </dl>
              </>
            ) : (
              <Skeleton className="h-32" />
            )}
          </Panel>

          <Panel title="Keeper actions" description="Permissionless. Any wallet can run them; none of them can move money to itself.">
            <div className="flex flex-col gap-6">
              <Keeper
                title="Rebalance"
                body={`Keep ${pool ? pct(pool.liquidityTargetBps) : "…"} of investor assets idle for instant claim payouts and move the rest into T-bills.`}
              >
                <TxAction label="Rebalance" variant="secondary" successTitle="Rebalanced" run={(opts) => dataSource.rebalance(opts)} />
              </Keeper>
              <Keeper title="Distribute USDG rewards" body="Pay the simulated partner rewards earned on idle USDG into the pool. The share price goes up.">
                <TxAction
                  label="Distribute rewards"
                  variant="secondary"
                  successTitle="Rewards distributed"
                  run={(opts) => dataSource.distributeRewards(opts)}
                />
              </Keeper>
              <Keeper
                title="Process the withdrawal queue"
                body={
                  pool
                    ? pool.queueLength === 0
                      ? "Nobody is waiting."
                      : `${pool.queueLength} request${pool.queueLength === 1 ? "" : "s"} waiting. Paid in order while the reserve allows.`
                    : "…"
                }
              >
                <TxAction
                  label="Process queue"
                  variant="secondary"
                  successTitle="Queue processed"
                  disabledReason={pool?.queueLength === 0 ? "Nobody is waiting" : null}
                  run={(opts) => dataSource.processQueue(10, opts)}
                />
              </Keeper>
            </div>
          </Panel>

          {IS_MOCK && <DemoClock />}
        </div>
      </div>
    </div>
  );
}

function ParamRow({
  spec,
  current,
  blocked,
}: {
  spec: (typeof PARAMS)[number];
  current: AdminParams[ParamKey];
  blocked: string | null;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const shown = spec.unit === "bps" ? pct(Number(current), 1) : usdg(current as bigint);
  const parsed = parse(value, spec.unit);
  const outOfRange = parsed !== null && (parsed < spec.min || parsed > spec.max);
  const range =
    spec.unit === "bps"
      ? `${pct(Number(spec.min), 0)} to ${pct(Number(spec.max), 0)}`
      : `${usdg(spec.min)} to ${usdg(spec.max)}`;

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <label htmlFor={id} className="font-semibold">
          {spec.label}
        </label>
        <p className="t-small mt-0.5 text-muted measure">
          {spec.help} Allowed: {range}.
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        <span className="nums text-[17px] font-semibold">{shown}</span>
        {editing ? (
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex items-center gap-2">
              <Input
                id={id}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={spec.unit === "bps" ? "e.g. 25" : "e.g. 20,000"}
                className="nums w-32 text-right"
                invalid={outOfRange || (value !== "" && parsed === null)}
              />
              <span className="t-small text-muted">{spec.unit === "bps" ? "%" : "USDG"}</span>
            </div>
            {outOfRange && <span className="t-small text-alert">Outside the allowed range.</span>}
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <TxAction
                size="sm"
                hideSteps
                label="Save"
                successTitle={`${spec.label} updated`}
                disabledReason={blocked ?? (parsed === null ? "Enter a value" : outOfRange ? "Outside the allowed range" : null)}
                run={(opts) => dataSource.setParam(spec.key, parsed!, opts)}
                onDone={() => {
                  setEditing(false);
                  setValue("");
                }}
              />
            </div>
          </div>
        ) : (
          <Button size="sm" variant="ghost" disabledReason={blocked} onClick={() => setEditing(true)}>
            Change
          </Button>
        )}
      </div>
    </li>
  );
}

/** "25" → 2500 bps; "20,000" → base units. */
function parse(input: string, unit: Unit): bigint | null {
  if (unit === "usdg") return parseAmount(input);
  const n = Number(input.replace(/[%\s]/g, ""));
  if (input.trim() === "" || !Number.isFinite(n) || n < 0) return null;
  return BigInt(Math.round(n * 100));
}

function Keeper({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h4 className="font-semibold">{title}</h4>
        <p className="t-small mt-0.5 text-muted">{body}</p>
      </div>
      {children}
    </div>
  );
}

/** Mock only. */
function DemoClock() {
  const steps: [string, number][] = [
    ["+3 days", 6],
    ["+7 days", 14],
    ["+1 month", 60],
  ];
  return (
    <Panel title="Demo clock" description="Mock mode only. Moves this tab's clock forward. On testnet, 1 minute is 1 month.">
      <div className="flex flex-wrap gap-2">
        {steps.map(([label, seconds]) => (
          <Button key={label} size="sm" variant="secondary" icon={<FastForward />} onClick={() => mockControls?.skip(seconds)}>
            {label}
          </Button>
        ))}
      </div>
    </Panel>
  );
}
