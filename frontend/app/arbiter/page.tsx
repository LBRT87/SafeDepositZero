"use client";

import { useId, useState } from "react";
import { AddressTag } from "@/components/address";
import { ClaimTimeline } from "@/components/claim-timeline";
import { Countdown } from "@/components/countdown";
import { EvidenceCompare } from "@/components/evidence";
import { TxAction } from "@/components/tx-action";
import { ClaimBadge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AmountInput, Field, Textarea } from "@/components/ui/field";
import { EmptyState, PageHeader, Panel, Skeleton, Stat } from "@/components/ui/panel";
import { DataTable } from "@/components/ui/table";
import { dataSource } from "@/lib/data";
import { useDS } from "@/lib/hooks";
import { CLAIM_TYPE_COPY, parseAmount, plain, timeDate, usdg } from "@/lib/format";
import { disputeFee } from "@/lib/premium";
import { useSession } from "@/lib/session";
import type { Claim, Policy } from "@/lib/data/types";

export default function ArbiterPage() {
  const { account } = useSession();
  const { data: isArbiter } = useDS(["arbiter", account], () => dataSource.hasArbiterRole(account!), { enabled: !!account });
  const queue = useDS(["claims", "disputed"], () => dataSource.getClaims({ disputedOnly: true }));
  const all = useDS(["claims", "all"], () => dataSource.getClaims({}));
  const policies = useDS(["policies", "all"], () => dataSource.getPolicies({}));
  const [selected, setSelected] = useState<number | null>(null);

  const byId = new Map(policies.data?.map((p) => [p.id, p]) ?? []);
  const current = queue.data?.find((c) => c.id === selected) ?? queue.data?.[0];
  const decided = all.data?.filter((c) => c.resolvedAt !== null && c.arbiterReason) ?? [];

  return (
    <div className="page flex flex-col gap-8">
      <PageHeader title="Disputes to decide" subtitle="Compare the evidence and decide what's fair. Your decision pays out immediately." />

      {account && isArbiter === false && (
        <Banner tone="info">
          Only wallets with the arbiter role can decide disputes. You can read every case here; the buttons stay disabled.
        </Banner>
      )}

      <Panel title="Queue">
        <DataTable
          caption="Dispute queue"
          loading={!queue.data || !policies.data}
          rows={queue.data}
          rowKey={(c) => c.id}
          selectedKey={current?.id ?? null}
          onRowClick={(c) => setSelected(c.id)}
          empty={<EmptyState title="No open disputes." body="When a tenant disputes a claim, it shows up here with a decision deadline." />}
          columns={[
            { header: "Claim", cell: (c) => <span className="nums font-semibold">{c.id}</span> },
            { header: "Unit", cell: (c) => byId.get(c.policyId)?.propertyRef ?? "…" },
            { header: "Claimed", align: "right", cell: (c) => usdg(c.amountClaimed) },
            { header: "Coverage", align: "right", cell: (c) => (byId.get(c.policyId) ? usdg(byId.get(c.policyId)!.coverage) : "…") },
            { header: "Opened", cell: (c) => <span className="nums">{timeDate(c.filedAt)}</span> },
            {
              header: "Deadline",
              cell: (c) => <Countdown deadline={c.arbiterDeadline} passed="Overdue" className="font-semibold text-marigold-ink" />,
            },
          ]}
        />
      </Panel>

      <Panel title="Guidelines" description="What a claim can and can't cover. Both sides agreed to these terms.">
        <dl className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Guideline
            term="Wear and tear isn't damage"
            body="Faded paint, light scuffs, worn carpet and loose fittings from normal use aren't claimable."
          />
          <Guideline
            term="Value old items at their age"
            body="An old item is worth its depreciated value, not the price of a new one. A ten-year-old sofa isn't a new sofa."
          />
          <Guideline
            term="Pre-existing damage is excluded"
            body="Anything visible in the check-in photos or the tenant's move-in notes was already there and can't be claimed."
          />
        </dl>
      </Panel>

      {current && byId.get(current.policyId) ? (
        <DisputeDetail key={current.id} claim={current} policy={byId.get(current.policyId)!} canDecide={!!isArbiter} />
      ) : queue.data && queue.data.length > 0 ? (
        <Skeleton className="h-96" />
      ) : null}

      {decided.length > 0 && (
        <Panel title="Decided">
          <DataTable
            caption="Decided disputes"
            rows={decided}
            rowKey={(c) => c.id}
            columns={[
              { header: "Claim", cell: (c) => <span className="nums">{c.id}</span> },
              { header: "Unit", cell: (c) => byId.get(c.policyId)?.propertyRef ?? "…" },
              { header: "Claimed", align: "right", cell: (c) => usdg(c.amountClaimed) },
              { header: "Approved", align: "right", cell: (c) => usdg(c.amountApproved) },
              { header: "Decision", cell: (c) => <ClaimBadge status={c.status === "Paid" ? (c.amountApproved === c.amountClaimed ? "Approved" : "PartiallyApproved") : c.status} /> },
            ]}
          />
        </Panel>
      )}
    </div>
  );
}

type Decision = { kind: "full" | "partial" | "reject"; amount: bigint };

function DisputeDetail({ claim, policy, canDecide }: { claim: Claim; policy: Policy; canDecide: boolean }) {
  const ids = { reason: useId(), partial: useId() };
  const [reason, setReason] = useState("");
  const [partialOpen, setPartialOpen] = useState(false);
  const [partial, setPartial] = useState("");
  const [confirm, setConfirm] = useState<Decision | null>(null);
  const partialAmt = parseAmount(partial);
  const partialError =
    partial && (!partialAmt || partialAmt === 0n)
      ? "Enter an amount above zero."
      : partialAmt && partialAmt >= claim.amountClaimed
        ? `Partial means less than ${usdg(claim.amountClaimed)}. Use "Approve full amount" instead.`
        : null;
  const fee = disputeFee(claim.amountClaimed);
  const missed = policy.lapsedAt ? policy.monthlyPremium : 0n;
  const blocked = !canDecide ? "Only wallets with the arbiter role can decide" : !reason.trim() ? "Write a reason first. Both sides will see it." : null;

  return (
    <Panel
      title={`Claim ${claim.id}: ${policy.propertyRef}`}
      description={`Filed ${timeDate(claim.filedAt)}. Decide within the deadline; your decision pays out immediately.`}
      actions={<ClaimBadge status={claim.status} />}
    >
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat label="Claimed" value={usdg(claim.amountClaimed)} />
        <Stat label="Coverage" value={usdg(policy.coverage)} />
        <Stat label="Decide within" value={<Countdown deadline={claim.arbiterDeadline} passed="Overdue" />} />
        <Stat label="Type" value={CLAIM_TYPE_COPY[claim.claimType]} size="body" sub={`Dispute fee ${usdg(fee)} if fully approved`} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Statement who="Landlord" address={policy.landlord} text={claim.landlordNote} />
        <Statement who="Tenant" address={policy.tenant} text={claim.tenantNote} />
      </div>

      <div className="mt-8">
        <EvidenceCompare checkIn={policy.checkInEvidenceHash} checkOut={claim.checkOutEvidenceHash} tenantNotes={policy.tenantCheckInHash} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1fr]">
        <div>
          <h4 className="t-label mb-4">Timeline</h4>
          <ClaimTimeline claim={claim} />
        </div>
        <div className="flex flex-col gap-4">
          <Field label="Reason for your decision" htmlFor={ids.reason} helper="Required. The landlord and tenant both see it.">
            <Textarea id={ids.reason} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={280} placeholder="e.g. Wall damage is new; the wardrobe door was already loose at check-in." />
          </Field>
          {partialOpen && (
            <Field label="Amount to approve" htmlFor={ids.partial} error={partialError} helper={`Less than ${usdg(claim.amountClaimed)}.`}>
              <AmountInput id={ids.partial} value={partial} onChange={setPartial} invalid={!!partialError} />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="success" disabledReason={blocked} onClick={() => setConfirm({ kind: "full", amount: claim.amountClaimed })}>
              Approve full amount
            </Button>
            <Button
              variant="secondary"
              disabledReason={blocked ?? (partialOpen && (!partialAmt || partialError) ? "Enter a valid partial amount" : null)}
              onClick={() => (partialOpen ? setConfirm({ kind: "partial", amount: partialAmt! }) : setPartialOpen(true))}
            >
              Approve partial amount
            </Button>
            <Button variant="destructive" disabledReason={blocked} onClick={() => setConfirm({ kind: "reject", amount: 0n })}>
              Reject claim
            </Button>
          </div>
        </div>
      </div>

      {confirm && (
        <Dialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={confirm.kind === "reject" ? "Reject this claim?" : confirm.kind === "full" ? "Approve the full amount?" : "Approve part of the claim?"}
          description={
            confirm.kind === "reject"
              ? "Nobody is paid. The guarantee closes and its coverage returns to the pool. The tenant owes nothing."
              : debtSentence(confirm, fee, missed)
          }
          actions={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Back
              </Button>
              <TxAction
                hideSteps
                label={confirm.kind === "reject" ? "Reject claim" : `Approve ${plain(confirm.amount)} USDG`}
                variant={confirm.kind === "reject" ? "destructive" : "success"}
                successTitle={confirm.kind === "reject" ? "Claim rejected" : "Claim approved"}
                successBody={confirm.kind === "reject" ? undefined : `${usdg(confirm.amount)} paid to the landlord.`}
                run={(opts) => dataSource.resolveDispute(claim.id, confirm.amount, reason, opts)}
                onDone={() => setConfirm(null)}
              />
            </>
          }
        />
      )}
    </Panel>
  );
}

function Statement({ who, address, text }: { who: string; address: string | null; text: string }) {
  return (
    <div className="rounded-btn border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="t-label">{who}&apos;s statement</h4>
        <span className="t-small">
          <AddressTag address={address} />
        </span>
      </div>
      <p className="mt-2 measure">{text || "No statement."}</p>
    </div>
  );
}

function debtSentence(d: Decision, fee: bigint, missed: bigint): string {
  const charged = d.kind === "full" ? fee : 0n;
  const extras = [
    missed > 0n ? `the ${usdg(missed)} fee they missed before the lapse` : null,
    charged > 0n ? `the ${usdg(charged)} dispute fee` : null,
  ].filter(Boolean);
  return (
    `The pool pays the landlord ${usdg(d.amount)} now. The tenant then owes the pool ${usdg(d.amount + missed + charged)}` +
    (extras.length ? `, including ${extras.join(" and ")}` : "") +
    ", repaid in 6 installments." +
    (d.kind === "partial" ? " A partial decision carries no dispute fee." : "")
  );
}

function Guideline({ term, body }: { term: string; body: string }) {
  return (
    <div>
      <dt className="font-semibold">{term}</dt>
      <dd className="mt-1 text-muted">{body}</dd>
    </div>
  );
}
