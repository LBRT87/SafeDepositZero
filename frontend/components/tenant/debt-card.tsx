"use client";

import { useId, useState } from "react";
import { Countdown } from "../countdown";
import { TxAction } from "../tx-action";
import { Badge } from "../ui/badge";
import { Banner } from "../ui/banner";
import { AmountInput, Field } from "../ui/field";
import { Panel, Stat } from "../ui/panel";
import { DataTable } from "../ui/table";
import { dataSource } from "@/lib/data";
import { useNow, useTimeConfig } from "@/lib/hooks";
import { parseAmount, plain, timeDate, usdg } from "@/lib/format";
import type { Debt, Policy } from "@/lib/data/types";

function debtParts(d: Debt): string | undefined {
  const parts = [
    d.missedPremium > 0n ? `${usdg(d.missedPremium)} missed fee` : null,
    d.disputeFee > 0n ? `${usdg(d.disputeFee)} dispute fee` : null,
  ].filter(Boolean);
  return parts.length ? `includes ${parts.join(" and ")}` : undefined;
}

export function DebtCard({ debt, policy }: { debt: Debt; policy: Policy | undefined }) {
  const time = useTimeConfig();
  const now = useNow();
  const id = useId();
  const [custom, setCustom] = useState("");
  const outstanding = debt.principal - debt.repaid;
  const nextAmount = outstanding < debt.installmentAmount ? outstanding : debt.installmentAmount - (debt.repaid % debt.installmentAmount);
  const customAmount = parseAmount(custom);
  const overdue = now !== null && debt.nextInstallmentDue > 0 && now > debt.nextInstallmentDue + (time?.gracePeriod ?? 0);
  const period = time?.installmentPeriod ?? 60;

  const schedule = Array.from({ length: debt.installments }, (_, i) => {
    const due = debt.startedAt + (i + 1) * period;
    const paidThrough = debt.repaid >= debt.installmentAmount * BigInt(i + 1) || debt.repaid >= debt.principal;
    const amount =
      i === debt.installments - 1 ? debt.principal - debt.installmentAmount * BigInt(debt.installments - 1) : debt.installmentAmount;
    return { n: i + 1, due, amount, paid: paidThrough };
  });

  if (outstanding === 0n) {
    return (
      <Panel title={`Repaid: ${policy?.propertyRef ?? `claim ${debt.claimId}`}`} actions={<Badge tone="green">Repaid</Badge>}>
        <p className="text-muted">You repaid {usdg(debt.principal)} in full. Thank you.</p>
      </Panel>
    );
  }

  return (
    <Panel
      title={`What you owe the pool: ${policy?.propertyRef ?? `claim ${debt.claimId}`}`}
      actions={debt.defaulted ? <Badge tone="alert">Defaulted</Badge> : <Badge tone="marigold">Repaying</Badge>}
    >
      {(debt.defaulted || overdue) && (
        <Banner tone="alert" className="mb-6">
          {debt.defaulted
            ? `This debt is marked as defaulted in your on-chain rental history, so this wallet can't take new guarantees. The first-loss reserve covered ${usdg(debt.coveredByFirstLoss)} of it for the pool.`
            : "An installment is overdue. If it stays unpaid, it will be recorded as a default in your on-chain rental history."}
        </Banner>
      )}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Amount owed" value={usdg(outstanding)} size="l" />
        <Stat label="Original debt" value={usdg(debt.principal)} sub={debtParts(debt)} size="body" />
        <Stat label="Repaid" value={usdg(debt.repaid)} size="body" />
        <Stat label="Next installment due" value={debt.nextInstallmentDue ? <Countdown deadline={debt.nextInstallmentDue} passed="Overdue" /> : "—"} size="body" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <DataTable
          caption="Installment schedule"
          rows={schedule}
          rowKey={(r) => r.n}
          columns={[
            { header: "Installment", cell: (r) => <span className="nums">{r.n}</span> },
            { header: "Due", cell: (r) => <span className="nums">{timeDate(r.due)}</span> },
            { header: "Amount", align: "right", cell: (r) => usdg(r.amount) },
            {
              header: "Status",
              cell: (r) =>
                r.paid ? <span className="font-semibold text-green-700">Paid</span> : <span className="text-muted">Open</span>,
            },
          ]}
        />
        <div className="flex flex-col gap-6">
          <TxAction
            label={`Repay ${plain(nextAmount)} USDG`}
            variant="success"
            successTitle="Repaid"
            successBody="Repayments go back into the pool."
            approval={{ spender: "claimManager", amount: nextAmount }}
            run={(opts) => dataSource.repay(debt.claimId, nextAmount, opts)}
          />
          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <Field label="Or repay another amount" htmlFor={id} helper={`Up to ${usdg(outstanding)}.`}>
              <AmountInput id={id} value={custom} onChange={setCustom} onMax={() => setCustom(plain(outstanding))} invalid={custom !== "" && !customAmount} />
            </Field>
            {customAmount && customAmount > 0n && (
              <TxAction
                label={`Repay ${plain(customAmount > outstanding ? outstanding : customAmount)} USDG`}
                variant="success"
                successTitle="Repaid"
                approval={{ spender: "claimManager", amount: customAmount > outstanding ? outstanding : customAmount }}
                run={(opts) => dataSource.repay(debt.claimId, customAmount, opts)}
                onDone={() => setCustom("")}
              />
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
