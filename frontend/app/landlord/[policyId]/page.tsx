"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use, useId, useState } from "react";
import { Certificate, CertificateSkeleton } from "@/components/certificate";
import { ClaimTimeline } from "@/components/claim-timeline";
import { Countdown } from "@/components/countdown";
import { EvidenceCompare, EvidenceUpload, EvidenceViewer } from "@/components/evidence";
import { ExplorerLink } from "@/components/explorer-link";
import { TxAction } from "@/components/tx-action";
import { Badge, ClaimBadge, PolicyBadge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { AmountInput, Field, Select, Textarea } from "@/components/ui/field";
import { EmptyState, Panel, Skeleton, Stat } from "@/components/ui/panel";
import { DataTable } from "@/components/ui/table";
import { dataSource } from "@/lib/data";
import { useDS, useNow, useTimeConfig } from "@/lib/hooks";
import { CLAIM_TYPE_COPY, parseAmount, shortAddress, timeDate, usdg } from "@/lib/format";
import { useSession } from "@/lib/session";
import { CLAIM_TYPES, type Claim, type ClaimType, type EvidenceBundle, type Policy } from "@/lib/data/types";

export default function UnitDetail({ params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = use(params);
  const id = Number(policyId);
  const { account } = useSession();
  const now = useNow();
  const time = useTimeConfig();
  const { data: policy, isLoading } = useDS(["policy", id], () => dataSource.getPolicy(id));
  const { data: claims } = useDS(["claims", "policy", id], () => dataSource.getClaims({ policyId: id }));
  const { data: premiums } = useDS(["premiums", id], () => dataSource.getPremiumHistory(id));

  const back = (
    <Link href="/landlord" className="t-small inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline decoration-2 underline-offset-[3px]">
      <ArrowLeft className="size-4" strokeWidth={1.75} /> All units
    </Link>
  );

  if (isLoading) {
    return (
      <div className="page pt-10">
        {back}
        <Skeleton className="mt-6 h-10 w-80" />
        <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[560px_1fr]">
          <CertificateSkeleton />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }
  if (!policy) {
    return (
      <div className="page pt-10">
        {back}
        <div className="mt-6">
          <EmptyState title="This unit doesn't exist." action={<ButtonLink href="/landlord">Back to your units</ButtonLink>} />
        </div>
      </div>
    );
  }

  const claim = claims?.[0];
  const isLandlord = account?.toLowerCase() === policy.landlord.toLowerCase();
  const grace = time?.gracePeriod ?? 0;
  const lapsed = policy.status === "Lapsed";
  const windowStart = lapsed ? policy.lapsedAt : policy.endTime;
  const windowOpen = now !== null && now >= windowStart && now <= policy.claimWindowEnd;
  const windowPassed = now !== null && now > policy.claimWindowEnd;
  const fullyPaid = policy.periodsPaid >= policy.totalPeriods;
  const ended =
    lapsed || policy.status === "Ended" || (policy.status === "Active" && fullyPaid && now !== null && now >= policy.endTime);

  return (
    <div className="page flex flex-col gap-8 pt-10">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="t-h1">{policy.propertyRef}</h1>
          <p className="t-body-l mt-2 text-muted">Policy {policy.id}. Tenant {policy.tenant ? shortAddress(policy.tenant) : "not set yet"}.</p>
        </div>
        <PolicyBadge status={policy.status} windowPassed={policy.status === "Ended" && windowPassed} />
      </div>

      {!isLandlord && (
        <Banner tone="info">You&apos;re viewing this unit as another wallet. Only the landlord can file a claim; anyone can run the time-based steps.</Banner>
      )}

      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,560px)_1fr]">
        <Certificate policy={policy} />

        <div className="flex min-w-0 flex-col gap-6">
          {policy.status === "Invited" && (
            <Panel title="Waiting for your tenant">
              <p className="text-muted">Share the invite link. The guarantee starts when your tenant accepts and pays the first fee.</p>
              <div className="t-mono mt-4 break-all rounded-btn bg-paper px-3 py-2.5">/invite/{policy.id}</div>
              {isLandlord && (
                <div className="mt-5">
                  <TxAction
                    label="Withdraw invite"
                    variant="ghost"
                    successTitle="Invite withdrawn"
                    run={(opts) => dataSource.cancelInvite(policy.id, opts)}
                  />
                </div>
              )}
            </Panel>
          )}

          {policy.status === "Active" && (
            <ActivePanel policy={policy} now={now} grace={grace} fullyPaid={fullyPaid} />
          )}

          {lapsed && !windowPassed && (
            <Banner tone="alert">
              Your tenant stopped paying the monthly fee, so the guarantee lapsed on {timeDate(policy.lapsedAt)}. Damage
              from before the lapse is still covered: file a claim before the window closes. The missed fee is added to
              your tenant&apos;s debt with the pool.
            </Banner>
          )}

          {ended && !windowPassed && policy.status !== "Claimed" && (
            <FileClaimPanel policy={policy} disabled={!isLandlord} windowOpen={windowOpen} />
          )}

          {ended && windowPassed && (
            <Panel title="No claim was filed">
              <p className="text-muted">The claim window has passed. Close the guarantee to release its coverage back to the pool.</p>
              <div className="mt-5">
                <TxAction label="Close guarantee" successTitle="Guarantee closed" run={(opts) => dataSource.closeIfNoClaim(policy.id, opts)} />
              </div>
            </Panel>
          )}

          {claim && <ClaimTracker claim={claim} policy={policy} now={now} />}

          <Panel title="Premium history">
            <DataTable
              caption="Premium history"
              loading={!premiums}
              rows={premiums}
              rowKey={(p) => p.period}
              empty={<p className="text-muted">No fees paid yet.</p>}
              columns={[
                { header: "Month", cell: (p) => <span className="nums">{p.period}</span> },
                { header: "Paid", cell: (p) => <span className="nums">{timeDate(p.paidAt)}</span> },
                { header: "Amount", align: "right", cell: (p) => usdg(p.amount) },
                { header: "To pool", align: "right", cell: (p) => usdg(p.toPool) },
                { header: "Tx", cell: (p) => <ExplorerLink hash={p.txHash} />, hideOnMobile: true },
              ]}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ActivePanel({ policy, now, grace, fullyPaid }: { policy: Policy; now: number | null; grace: number; fullyPaid: boolean }) {
  const overdue = !fullyPaid && now !== null && now > policy.nextPremiumDue + grace;
  const leaseOver = now !== null && now >= policy.endTime;
  return (
    <Panel title={overdue ? "Your tenant missed a fee" : leaseOver ? "The lease has ended" : "Protected"}>
      {overdue ? (
        <>
          <p className="text-muted">
            The fee was due {timeDate(policy.nextPremiumDue)} and the grace period has passed. Marking the guarantee as
            lapsed opens your claim window now. Damage from before the lapse stays covered, and the missed fee is added to
            your tenant&apos;s debt if you claim.
          </p>
          <div className="mt-5">
            <TxAction label="Mark as lapsed" variant="destructive" successTitle="Guarantee lapsed" run={(opts) => dataSource.markLapsed(policy.id, opts)} />
          </div>
        </>
      ) : leaseOver ? (
        <>
          <p className="text-muted">End the lease to open the claim window. Anyone can do this step.</p>
          <div className="mt-5">
            <TxAction label="End lease" successTitle="Lease ended" successBody="The claim window is open." run={(opts) => dataSource.endLease(policy.id, opts)} />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <Stat label="Covered up to" value={usdg(policy.coverage)} tone="green" />
          <Stat label="Lease ends in" value={<Countdown deadline={policy.endTime} />} />
          <Stat label="Fees paid" value={`${policy.periodsPaid} of ${policy.totalPeriods}`} size="body" />
          <Stat label="Next fee due" value={policy.nextPremiumDue ? timeDate(policy.nextPremiumDue) : "All paid"} size="body" />
        </div>
      )}
    </Panel>
  );
}

function FileClaimPanel({ policy, disabled, windowOpen }: { policy: Policy; disabled: boolean; windowOpen: boolean }) {
  const ids = { amt: useId(), note: useId(), type: useId() };
  const [claimType, setClaimType] = useState<ClaimType>(policy.status === "Lapsed" ? "UnpaidRent" : "Damage");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [checkOut, setCheckOut] = useState<EvidenceBundle | null>(null);
  const amt = parseAmount(amount);
  const amountError = amount && !amt ? "Enter an amount." : amt && amt > policy.coverage ? `The claim can't be more than ${usdg(policy.coverage)}.` : null;
  const reason = disabled
    ? "Only the landlord can file a claim"
    : !windowOpen
      ? "The claim window isn't open"
      : !amt || amt === 0n
        ? "Enter the amount to claim"
        : amountError
          ? amountError
          : !checkOut
            ? "Add check-out photos"
            : null;

  return (
    <Panel
      title="File a claim"
      actions={<Badge tone="marigold">Claim window open</Badge>}
      description="Report damage beyond normal wear and tear. Your tenant can accept or dispute; approved claims are paid by the pool straight away."
    >
      <div className="flex items-baseline gap-3">
        <span className="t-small text-muted">Time left</span>
        <Countdown deadline={policy.claimWindowEnd} className="t-amount-l text-marigold-ink" passed="Window closed" />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4">
        <Field label="Type of claim" htmlFor={ids.type} helper="Wear and tear and damage that was already there at move-in aren't claimable.">
          <Select id={ids.type} value={claimType} onChange={(e) => setClaimType(e.target.value as ClaimType)}>
            {CLAIM_TYPES.map((t) => (
              <option key={t} value={t}>
                {CLAIM_TYPE_COPY[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount to claim" htmlFor={ids.amt} error={amountError} helper={`Up to ${usdg(policy.coverage)}.`}>
          <AmountInput id={ids.amt} value={amount} onChange={setAmount} onMax={() => setAmount(String(Number(policy.coverage) / 1e6))} invalid={!!amountError} />
        </Field>
        <Field label="What was damaged?" htmlFor={ids.note} helper="Your tenant and the arbiter will read this.">
          <Textarea id={ids.note} value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="e.g. Wardrobe door broken off its hinge; crack in the bedroom wall." />
        </Field>
        <EvidenceUpload label="Check-out photos" helper="Pinned to IPFS and compared against check-in." value={checkOut} onChange={setCheckOut} note={note.trim()} />
        <EvidenceViewer title="Check-in evidence for comparison" hash={policy.checkInEvidenceHash} compact />
      </div>
      <div className="mt-6">
        <TxAction
          label="File a claim"
          successTitle="Claim filed"
          successBody="Your tenant can now accept or dispute it."
          disabledReason={reason}
          run={async (opts) => {
            await dataSource.storeEvidence(checkOut!);
            return dataSource.fileClaim({ policyId: policy.id, claimType, amount: amt!, note: note.trim(), checkOut: checkOut! }, opts);
          }}
        />
      </div>
    </Panel>
  );
}

function ClaimTracker({ claim, policy, now }: { claim: Claim; policy: Policy; now: number | null }) {
  const silencePassed = claim.status === "Filed" && now !== null && now > claim.responseDeadline;
  return (
    <Panel title="Claim tracker" description={`${CLAIM_TYPE_COPY[claim.claimType]} claim`} actions={<ClaimBadge status={claim.status} />}>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <Stat label="Claimed" value={usdg(claim.amountClaimed)} />
        {claim.status === "Paid" && <Stat label="Paid to you" value={usdg(claim.amountApproved)} tone="green" />}
        {claim.status === "Filed" && <Stat label="Tenant responds within" value={<Countdown deadline={claim.responseDeadline} passed="Deadline passed" />} />}
        {claim.status === "Disputed" && <Stat label="Arbiter decides within" value={<Countdown deadline={claim.arbiterDeadline} passed="Overdue" />} />}
      </div>
      {claim.status === "Rejected" && (
        <Banner tone="alert" className="mt-5">
          The arbiter rejected this claim: {claim.arbiterReason}
        </Banner>
      )}
      <div className="mt-6">
        <ClaimTimeline claim={claim} />
      </div>
      {silencePassed && (
        <div className="mt-6 flex flex-col gap-3">
          <p className="text-muted">Your tenant didn&apos;t respond in time, so the claim counts as accepted.</p>
          <TxAction
            label="Accept claim automatically (deadline passed)"
            successTitle="Claim accepted automatically"
            successBody={`The pool pays you ${usdg(claim.amountClaimed)}.`}
            run={(opts) => dataSource.autoAcceptClaim(claim.id, opts)}
          />
        </div>
      )}
      <div className="mt-8">
        <EvidenceCompare checkIn={policy.checkInEvidenceHash} checkOut={claim.checkOutEvidenceHash} tenantNotes={policy.tenantCheckInHash} />
      </div>
    </Panel>
  );
}
