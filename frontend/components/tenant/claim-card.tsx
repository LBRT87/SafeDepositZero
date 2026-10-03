"use client";

import { useId, useState } from "react";
import { ClaimTimeline } from "../claim-timeline";
import { Countdown } from "../countdown";
import { EvidenceCompare } from "../evidence";
import { TxAction } from "../tx-action";
import { ClaimBadge } from "../ui/badge";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Field, Textarea } from "../ui/field";
import { Panel, Stat } from "../ui/panel";
import { dataSource } from "@/lib/data";
import { useNow } from "@/lib/hooks";
import { CLAIM_TYPE_COPY, timeDate, usdg } from "@/lib/format";
import type { Claim, Policy } from "@/lib/data/types";

export function TenantClaimCard({ claim, policy }: { claim: Claim; policy: Policy }) {
  const now = useNow();
  const noteId = useId();
  const [disputing, setDisputing] = useState(false);
  const [note, setNote] = useState("");
  const deadlinePassed = now !== null && now > claim.responseDeadline;
  const canRespond = claim.status === "Filed" && !deadlinePassed;

  return (
    <Panel
      id={`claim-${claim.id}`}
      title={`${CLAIM_TYPE_COPY[claim.claimType]} claim on ${policy.propertyRef}`}
      description={`Claim ${claim.id}, filed ${timeDate(claim.filedAt)}`}
      actions={<ClaimBadge status={claim.status} />}
    >
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Claimed" value={usdg(claim.amountClaimed)} />
        <Stat label="Coverage" value={usdg(policy.coverage)} />
        {claim.status === "Paid" && <Stat label="Approved" value={usdg(claim.amountApproved)} />}
        {claim.status === "Filed" && (
          <Stat label="Respond within" value={<Countdown deadline={claim.responseDeadline} passed="Deadline passed" />} />
        )}
        {claim.status === "Disputed" && (
          <Stat label="Arbiter decides within" value={<Countdown deadline={claim.arbiterDeadline} passed="Overdue" />} />
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h4 className="t-label">Landlord&apos;s note</h4>
          <p className="mt-1 measure">{claim.landlordNote || "No note."}</p>
        </div>
        {claim.tenantNote && (
          <div>
            <h4 className="t-label">Your note</h4>
            <p className="mt-1 measure">{claim.tenantNote}</p>
          </div>
        )}
        {claim.arbiterReason && (
          <div className="md:col-span-2">
            <h4 className="t-label">Arbiter&apos;s reason</h4>
            <p className="mt-1 measure">{claim.arbiterReason}</p>
          </div>
        )}
      </div>

      <div className="mt-8">
        <EvidenceCompare checkIn={policy.checkInEvidenceHash} checkOut={claim.checkOutEvidenceHash} tenantNotes={policy.tenantCheckInHash} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-[1fr_1fr]">
        <div>
          <h4 className="t-label mb-4">Timeline</h4>
          <ClaimTimeline claim={claim} />
        </div>

        {claim.status === "Filed" && (
          <div className="flex flex-col gap-4">
            <Banner tone="marigold">
              If you don&apos;t respond by {timeDate(claim.responseDeadline)}, the claim is accepted.
            </Banner>
            {canRespond && !disputing && (
              <div className="flex flex-wrap items-start gap-3">
                <TxAction
                  label="Accept claim"
                  variant="success"
                  successTitle="Claim accepted"
                  successBody={`The pool pays your landlord ${usdg(claim.amountClaimed)}. You'll repay it in installments.`}
                  run={(opts) => dataSource.acceptClaim(claim.id, opts)}
                />
                <Button variant="secondary" onClick={() => setDisputing(true)}>
                  Dispute claim
                </Button>
              </div>
            )}
            {canRespond && disputing && (
              <div className="flex flex-col gap-4">
                <Field label="Why do you disagree?" htmlFor={noteId} helper="A neutral arbiter reads this next to both sets of photos.">
                  <Textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="e.g. The wardrobe door was already loose at check-in (photo 2)." />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <TxAction
                    label="Dispute claim"
                    variant="primary"
                    successTitle="Claim disputed"
                    successBody="An arbiter will compare the evidence and decide."
                    disabledReason={note.trim() ? null : "Write a short reason first"}
                    run={(opts) => dataSource.disputeClaim(claim.id, note, opts)}
                    onDone={() => setDisputing(false)}
                  />
                  <Button variant="ghost" onClick={() => setDisputing(false)}>
                    Back
                  </Button>
                </div>
              </div>
            )}
            {deadlinePassed && (
              <TxAction
                label="Accept claim automatically (deadline passed)"
                variant="secondary"
                successTitle="Claim accepted automatically"
                run={(opts) => dataSource.autoAcceptClaim(claim.id, opts)}
              />
            )}
          </div>
        )}
        {claim.status === "Disputed" && (
          <Banner tone="info">An arbiter is comparing the check-in and check-out evidence. Their decision pays out immediately.</Banner>
        )}
      </div>
    </Panel>
  );
}
