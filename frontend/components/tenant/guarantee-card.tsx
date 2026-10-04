"use client";

import { useId, useState } from "react";
import { Certificate } from "../certificate";
import { Countdown } from "../countdown";
import { EvidenceUpload, EvidenceViewer } from "../evidence";
import { Button } from "../ui/button";
import { Field, Textarea } from "../ui/field";
import { TxAction } from "../tx-action";
import { PolicyBadge } from "../ui/badge";
import { Banner } from "../ui/banner";
import { Panel } from "../ui/panel";
import { DataTable } from "../ui/table";
import { ExplorerLink } from "../explorer-link";
import { dataSource } from "@/lib/data";
import { useDS, useNow, useTimeConfig } from "@/lib/hooks";
import { timeDate, usdg } from "@/lib/format";
import type { EvidenceBundle, Policy, PremiumPayment } from "@/lib/data/types";

interface Row {
  period: number;
  due: number;
  amount: bigint;
  status: "Paid" | "Due" | "Overdue" | "Upcoming" | "Missed";
  payment?: PremiumPayment;
}

export function GuaranteeCard({ policy }: { policy: Policy }) {
  const time = useTimeConfig();
  const now = useNow();
  const { data: history } = useDS(["premiums", policy.id], () => dataSource.getPremiumHistory(policy.id));

  const grace = time?.gracePeriod ?? 0;
  const period = time?.premiumPeriod ?? 60;
  const rows: Row[] = Array.from({ length: policy.totalPeriods }, (_, i) => {
    const k = i + 1;
    const due = policy.startTime + i * period;
    const payment = history?.find((h) => h.period === k);
    let status: Row["status"] = "Upcoming";
    if (k <= policy.periodsPaid) status = "Paid";
    else if (policy.status === "Lapsed") status = "Missed";
    else if (k === policy.periodsPaid + 1 && now !== null)
      status = now > due + grace ? "Overdue" : now >= due - period ? "Due" : "Upcoming";
    return { period: k, due, amount: policy.monthlyPremium, status, payment };
  });

  const [showPaid, setShowPaid] = useState(false);
  // Show the last paid month and what's left.
  const hiddenPaid = showPaid ? 0 : Math.max(0, policy.periodsPaid - 1);
  const visibleRows = rows.slice(hiddenPaid);

  const canPay = policy.status === "Active" && policy.periodsPaid < policy.totalPeriods;
  const overdue = canPay && now !== null && now > policy.nextPremiumDue + grace;
  const dueSoon = canPay && now !== null && !overdue && policy.nextPremiumDue - now < period;

  return (
    <Panel
      title={policy.propertyRef}
      actions={<PolicyBadge status={policy.status} />}
      bodyClassName="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,560px)_1fr]"
    >
      <Certificate policy={policy} />
      <div className="flex min-w-0 flex-col gap-5">
        {overdue ? (
          <Banner tone="alert">
            This month&apos;s fee is past its grace period. The guarantee can be marked as lapsed at any moment, and your
            landlord would lose cover.
          </Banner>
        ) : dueSoon ? (
          <Banner tone="marigold" live>
            Next fee of {usdg(policy.monthlyPremium)} is due in <Countdown deadline={policy.nextPremiumDue} passed="now" />.
            Pay within the grace period to keep the guarantee active.
          </Banner>
        ) : null}

        <div>
          <h4 className="t-label mb-2">Payment schedule</h4>
          <DataTable
            caption="Payment schedule"
            rows={visibleRows}
            rowKey={(r) => r.period}
            columns={[
              { header: "Month", cell: (r) => <span className="nums">{r.period}</span> },
              { header: "Due", cell: (r) => <span className="nums">{timeDate(r.due)}</span> },
              { header: "Amount", align: "right", cell: (r) => usdg(r.amount) },
              {
                header: "Status",
                cell: (r) =>
                  r.status === "Paid" ? (
                    <span className="flex flex-col">
                      <span className="font-semibold text-green-700">Paid</span>
                      {r.payment && (
                        <span className="t-small">
                          <ExplorerLink hash={r.payment.txHash} />
                        </span>
                      )}
                    </span>
                  ) : (
                    <span
                      className={
                        r.status === "Overdue" || r.status === "Missed"
                          ? "font-semibold text-alert"
                          : r.status === "Due"
                            ? "font-semibold text-marigold-ink"
                            : "text-muted"
                      }
                    >
                      {r.status}
                    </span>
                  ),
              },
            ]}
          />
          {policy.periodsPaid > 1 && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowPaid((v) => !v)}>
              {showPaid ? "Hide earlier paid months" : `Show ${hiddenPaid} earlier paid month${hiddenPaid === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>

        {canPay ? (
          <TxAction
            label="Pay this month's fee"
            successTitle="Fee paid"
            successBody="75% went to the pool, 10% to the first-loss reserve, the rest to SafeDeposit Zero."
            approval={{ spender: "policyManager", amount: policy.monthlyPremium }}
            disabledReason={overdue ? "The grace period has passed for this fee" : null}
            run={(opts) => dataSource.payPremium(policy.id, opts)}
          />
        ) : policy.status === "Active" ? (
          <p className="text-muted">
            Every fee is paid. The lease ends in <Countdown deadline={policy.endTime} passed="now" />.
          </p>
        ) : policy.status === "Ended" ? (
          <p className="text-muted">
            Your lease has ended. Your landlord can report damage until the claim window closes in{" "}
            <Countdown deadline={policy.claimWindowEnd} passed="now" />. No claim means nothing more to do.
          </p>
        ) : policy.status === "Lapsed" ? (
          <Banner tone="alert">
            This guarantee lapsed because a monthly fee wasn&apos;t paid. Your landlord can still claim for damage from before
            the lapse for <Countdown deadline={policy.claimWindowEnd} passed="no longer" />, and the missed fee would be
            added to what you owe.
          </Banner>
        ) : null}

        {policy.tenantCheckInHash ? (
          <EvidenceViewer title="Your move-in notes" hash={policy.tenantCheckInHash} compact />
        ) : policy.status === "Active" && now !== null && time && now <= policy.startTime + time.checkInWindow ? (
          <MoveInNotes policy={policy} deadline={policy.startTime + time.checkInWindow} />
        ) : null}
      </div>
    </Panel>
  );
}

/** Tenant's move-in notes, within the check-in window. */
function MoveInNotes({ policy, deadline }: { policy: Policy; deadline: number }) {
  const noteId = useId();
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<EvidenceBundle | null>(null);
  return (
    <div className="flex flex-col gap-4 border-t border-line pt-5">
      <div>
        <h4 className="t-label">Add your move-in notes</h4>
        <p className="t-small mt-1 text-muted measure">
          Photograph anything already damaged. Damage that was there when you moved in can&apos;t be claimed. Time left:{" "}
          <Countdown deadline={deadline} passed="closed" className="font-semibold text-marigold-ink" />.
        </p>
      </div>
      <Field label="What did you notice?" htmlFor={noteId}>
        <Textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          placeholder="e.g. Left wardrobe door is loose; small scratch on the kitchen counter."
        />
      </Field>
      <EvidenceUpload
        label="Move-in photos"
        value={photos}
        onChange={setPhotos}
        note={note.trim()}
        helper="Pinned to IPFS. Your landlord and the arbiter see them next to the landlord's photos."
      />
      <TxAction
        label="Save move-in notes"
        variant="secondary"
        successTitle="Move-in notes saved"
        successBody="They're on record next to your landlord's check-in photos."
        disabledReason={photos ? null : "Add at least one photo"}
        run={async (opts) => {
          await dataSource.storeEvidence(photos!);
          return dataSource.addCheckInEvidence(policy.id, photos!, opts);
        }}
      />
    </div>
  );
}
