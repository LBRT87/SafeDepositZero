"use client";

import { useId, useState } from "react";
import { TxAction } from "../tx-action";
import { Banner } from "../ui/banner";
import { AmountInput, Field } from "../ui/field";
import { Panel } from "../ui/panel";
import { Tabs } from "../ui/tabs";
import { dataSource } from "@/lib/data";
import { useDS, useUsdgBalance } from "@/lib/hooks";
import { parseAmount, plain, timeDate, usdg } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { PoolStats, QueueRequest } from "@/lib/data/types";

export function DepositWithdraw({ stats }: { stats: PoolStats | undefined }) {
  const [tab, setTab] = useState("deposit");
  return (
    <Panel title="Your position" bodyClassName="px-5 pb-5 pt-1 md:px-6">
      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "deposit", label: "Deposit", content: <DepositTab stats={stats} /> },
          { value: "withdraw", label: "Withdraw", content: <WithdrawTab stats={stats} /> },
        ]}
      />
    </Panel>
  );
}

function Position() {
  const { account } = useSession();
  const { data: pos } = useDS(["position", account], () => dataSource.getInvestorPosition(account!), { enabled: !!account });
  return (
    <dl className="grid grid-cols-2 gap-4 rounded-btn bg-paper p-4">
      <div>
        <dt className="t-small text-muted">Your shares</dt>
        <dd className="nums mt-1 font-semibold">{pos ? `${(Number(pos.shares) / 1e12).toLocaleString("en-US", { maximumFractionDigits: 2 })} sdUSDG` : "…"}</dd>
      </div>
      <div>
        <dt className="t-small text-muted">Current value</dt>
        <dd className="nums mt-1 font-semibold">{pos ? usdg(pos.assets) : "…"}</dd>
      </div>
    </dl>
  );
}

function DepositTab({ stats }: { stats: PoolStats | undefined }) {
  const id = useId();
  const { account } = useSession();
  const [value, setValue] = useState("");
  const { data: balance } = useUsdgBalance(account);
  const amount = parseAmount(value);
  const { data: shares } = useDS(["previewDeposit", amount?.toString()], () => dataSource.previewDeposit(amount!), {
    enabled: !!amount && amount > 0n,
  });
  const tooMuch = amount !== null && balance !== undefined && amount > balance;

  return (
    <div className="flex flex-col gap-5">
      <Position />
      {stats?.paused && <Banner tone="alert">Deposits are paused by the protocol admin. Withdrawals of free capital still work.</Banner>}
      {stats && stats.totalShares > 0n && stats.totalAssets === 0n && (
        <Banner tone="alert">Open claims are larger than the pool&apos;s free assets right now, so deposits are paused until they settle.</Banner>
      )}
      <Field label="Amount" htmlFor={id} helper={balance !== undefined ? `Wallet balance ${usdg(balance)}` : undefined}>
        <AmountInput id={id} value={value} onChange={setValue} onMax={() => balance !== undefined && setValue(plain(balance).replace(/,/g, ""))} invalid={value !== "" && !amount} />
      </Field>
      {amount && amount > 0n && (
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="t-small text-muted">You receive</dt>
            <dd className="nums mt-1 font-semibold">
              {shares !== undefined ? `${(Number(shares) / 1e12).toLocaleString("en-US", { maximumFractionDigits: 4 })} sdUSDG` : "…"}
            </dd>
          </div>
          <div>
            <dt className="t-small text-muted">Share price</dt>
            <dd className="nums mt-1 font-semibold">{stats ? `$${stats.sharePrice.toFixed(4)}` : "…"}</dd>
          </div>
        </dl>
      )}
      <TxAction
        label="Deposit USDG"
        successTitle="Deposited"
        successBody="Your USDG now backs rental guarantees."
        approval={amount && amount > 0n && !tooMuch ? { spender: "pool", amount } : null}
        disabledReason={stats?.paused ? "Deposits are paused" : !amount || amount === 0n ? "Enter an amount" : null}
        run={(opts) => dataSource.deposit(amount!, opts)}
        onDone={() => setValue("")}
        fullWidthOnMobile
      />
      {tooMuch && balance !== undefined && <TooMuch need={amount! - balance} />}
    </div>
  );
}

function TooMuch({ need }: { need: bigint }) {
  return <p className="t-small text-alert">That&apos;s {usdg(need)} more than your wallet holds.</p>;
}

function WithdrawTab({ stats }: { stats: PoolStats | undefined }) {
  const id = useId();
  const { account } = useSession();
  const [value, setValue] = useState("");
  const { data: pos } = useDS(["position", account], () => dataSource.getInvestorPosition(account!), { enabled: !!account });
  const amount = parseAmount(value);
  const overPosition = amount !== null && pos !== undefined && amount > pos.assets;
  const queueIt = amount !== null && pos !== undefined && amount > pos.maxWithdraw && !overPosition;
  const { data: sharesToQueue } = useDS(["previewWithdrawShares", amount?.toString()], () => dataSource.previewWithdrawShares(amount!), {
    enabled: queueIt,
  });

  return (
    <div className="flex flex-col gap-5">
      <Position />
      {pos && pos.limitedByReserve && (
        <Banner tone="marigold">
          Up to {usdg(pos.maxWithdraw)} can be withdrawn now. Request the rest and it will be paid as soon as liquidity
          frees up.
        </Banner>
      )}
      <Field
        label="Amount"
        htmlFor={id}
        error={overPosition ? "That's more than your position in the pool." : null}
        helper={pos ? `Available now ${usdg(pos.maxWithdraw)}. Your position ${usdg(pos.assets)}.` : undefined}
      >
        <AmountInput
          id={id}
          value={value}
          onChange={setValue}
          onMax={() => pos && setValue(plain(pos.maxWithdraw).replace(/,/g, ""))}
          invalid={overPosition || (value !== "" && !amount)}
        />
      </Field>
      {queueIt ? (
        <>
          <p className="t-small text-muted">
            That&apos;s more than the pool can pay out right now. Your shares wait in a first-come queue and keep earning
            (or absorbing claims) until they&apos;re paid at the price on that day.
          </p>
          <TxAction
            label="Request withdrawal"
            successTitle="Withdrawal requested"
            successBody="You're in the queue. Anyone can process it once liquidity frees up."
            disabledReason={sharesToQueue === undefined ? "Working out the shares…" : null}
            run={(opts) => dataSource.requestRedeem(sharesToQueue!, opts)}
            onDone={() => setValue("")}
            fullWidthOnMobile
          />
        </>
      ) : (
        <TxAction
          label="Withdraw"
          successTitle="Withdrawn"
          disabledReason={
            !amount || amount === 0n ? "Enter an amount" : overPosition ? "More than your position" : pos?.shares === 0n ? "You have no shares" : null
          }
          run={(opts) => dataSource.withdraw(amount!, opts)}
          onDone={() => setValue("")}
          fullWidthOnMobile
        />
      )}
      {pos && pos.queued.length > 0 && <QueuedRequests requests={pos.queued} />}
      {stats && <p className="t-small text-muted">Withdrawals keep working even if new deposits are paused.</p>}
    </div>
  );
}

function QueuedRequests({ requests }: { requests: QueueRequest[] }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-5">
      <h4 className="t-label">Your queued withdrawals</h4>
      <ul className="flex flex-col divide-y divide-line">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <div className="nums font-semibold">{usdg(r.assetsNow)}</div>
              <div className="t-small text-muted">
                {r.position === 1 ? "Next in line" : `Number ${r.position} in line`}, requested {timeDate(r.requestedAt)}
              </div>
            </div>
            <TxAction
              label="Cancel"
              variant="ghost"
              size="sm"
              successTitle="Request cancelled"
              successBody="Your shares are back in your wallet."
              run={(opts) => dataSource.cancelRedeem(r.id, opts)}
            />
          </li>
        ))}
      </ul>
      <TxAction
        label="Process the queue"
        variant="secondary"
        size="sm"
        successTitle="Queue processed"
        successBody="Requests are paid in order while the reserve allows."
        run={(opts) => dataSource.processQueue(10, opts)}
      />
    </div>
  );
}
