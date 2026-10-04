"use client";

import Link from "next/link";
import { use, useState } from "react";
import { AddressTag } from "@/components/address";
import { Certificate, CertificateSkeleton } from "@/components/certificate";
import { TxAction } from "@/components/tx-action";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, Skeleton } from "@/components/ui/panel";
import { KNOWN_NAMES } from "@/lib/data/mock";
import { dataSource, IS_MOCK } from "@/lib/data";
import { useDS, useTimeConfig } from "@/lib/hooks";
import { money, moneyShort, shortAddress, term, usdg } from "@/lib/format";
import { TIER_COPY, TIER_EXPLAINER } from "@/lib/premium";
import { useSession } from "@/lib/session";

export default function InvitePage({ params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = use(params);
  const id = Number(policyId);
  const { account } = useSession();
  const time = useTimeConfig();
  const [agreed, setAgreed] = useState(false);
  const [justAccepted, setJustAccepted] = useState(false);

  const { data: policy, isLoading, isError } = useDS(["policy", id], () => dataSource.getPolicy(id), {
    enabled: Number.isFinite(id),
  });
  const { data: history } = useDS(["tenantHistory", account], () => dataSource.getTenantHistory(account!), {
    enabled: !!account,
  });
  // Open invites priced for the viewer; accepted ones show the locked fee.
  const tier = policy && policy.status !== "Invited" ? policy.tier : (history?.tier ?? "B");
  const { data: quote } = useDS(
    ["policyQuote", id, tier],
    () => dataSource.quote(policy!.coverage, policy!.totalPeriods, tier),
    { enabled: !!policy },
  );
  const fee = policy && policy.status !== "Invited" ? policy.monthlyPremium : quote?.monthlyPremium;

  if (isLoading || (!policy && !isError && Number.isFinite(id))) {
    return (
      <div className="page">
        <div className="pb-8 pt-12">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="mt-3 h-5 w-[32rem] max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <CertificateSkeleton />
        </div>
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="page pt-12">
        <EmptyState
          title="This invite doesn't exist."
          body="Check the link with your landlord. Invite links look like /invite/12."
          action={<ButtonLink href="/invite/1">Try the demo invite</ButtonLink>}
        />
      </div>
    );
  }

  const landlordName = (IS_MOCK && KNOWN_NAMES[policy.landlord.toLowerCase()]) || shortAddress(policy.landlord);
  const forOtherWallet = policy.tenant && account && policy.tenant.toLowerCase() !== account.toLowerCase();
  const isLandlord = account?.toLowerCase() === policy.landlord.toLowerCase();
  const alreadyAccepted = policy.status !== "Invited";
  const blocked = !!history?.blocked && !alreadyAccepted;

  return (
    <div className="page">
      <PageHeader
        title="Move in without a deposit"
        subtitle={
          <>
            {landlordName} is asking for a {moneyShort(policy.coverage)} deposit for {policy.propertyRef}. Pay{" "}
            {fee !== undefined ? money(fee) : "…"}/month instead.
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_minmax(0,560px)]">
        <div className="flex flex-col gap-6">
          {justAccepted ? (
            <Banner tone="green" action={<ButtonLink href="/tenant" size="sm">Go to your guarantees</ButtonLink>}>
              You&apos;re covered. Your landlord is protected up to {usdg(policy.coverage)}.
            </Banner>
          ) : policy.status === "Cancelled" ? (
            <Banner tone="info">Your landlord withdrew this invite. Ask them for a new link.</Banner>
          ) : alreadyAccepted ? (
            <Banner tone="info" action={<ButtonLink href="/tenant" size="sm" variant="secondary">Your guarantees</ButtonLink>}>
              This invite was already accepted.
            </Banner>
          ) : blocked ? (
            <Banner tone="alert" action={<ButtonLink href="/tenant" size="sm" variant="secondary">See what you owe</ButtonLink>}>
              {history?.defaulted
                ? "A past debt on this wallet was marked as defaulted, so it can't take a new guarantee."
                : "This wallet still owes the pool for a past claim. Repay it first, then accept this invite."}
            </Banner>
          ) : null}

          <Panel title="The guarantee">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <Item label="Landlord" value={<AddressTag address={policy.landlord} />} />
              <Item label="Property" value={policy.propertyRef} />
              <div className="sm:col-span-2">
                <dt className="t-small text-muted">Coverage</dt>
                <dd className="t-amount-l mt-1 text-green-700">{usdg(policy.coverage)}</dd>
                <dd className="mt-1 text-muted">Your landlord is protected up to {moneyShort(policy.coverage)}.</dd>
              </div>
              <Item label="Monthly fee" value={<span className="nums">{fee !== undefined ? usdg(fee) : "…"}</span>} />
              <Item label="Term" value={term(policy.totalPeriods, time)} />
              <Item
                label="Total cost over the lease"
                value={<span className="nums">{fee !== undefined ? usdg(fee * BigInt(policy.totalPeriods)) : "…"}</span>}
              />
              <Item label="Your fee tier" value={TIER_COPY[tier].label} />
            </dl>
            <p className="t-small mt-5 text-muted measure">{TIER_EXPLAINER}</p>
          </Panel>

          {!alreadyAccepted && (
            <Panel title="Before you accept">
              <ul className="flex flex-col gap-2 measure">
                <li>You&apos;re still responsible for damage you cause. If a claim is approved, the pool pays your landlord and you repay the pool in installments.</li>
                <li>Normal wear and tear isn&apos;t damage, and damage that was already there at move-in can&apos;t be claimed. You can add your own move-in photos in the first days.</li>
                <li>If your landlord files a claim and you don&apos;t respond before the deadline, the claim is accepted.</li>
                <li>Pay the fee each month. If it stays unpaid past the grace period, the guarantee lapses and the missed fee is added to any claim.</li>
              </ul>
              <label className="mt-5 flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 size-4 shrink-0 accent-brand-700"
                />
                <span>
                  I understand I&apos;m still responsible for damage I cause, and that approved claims are repaid in
                  installments.
                </span>
              </label>
              <div className="mt-6">
                <TxAction
                  label="Accept and pay first fee"
                  successTitle="Guarantee purchased"
                  successBody={`${fee !== undefined ? usdg(fee) : "Your first fee"} paid. 75% went to the pool, 10% to the first-loss reserve, the rest to SafeDeposit Zero.`}
                  approval={fee !== undefined ? { spender: "policyManager", amount: fee } : null}
                  fullWidthOnMobile
                  disabledReason={
                    isLandlord
                      ? "This is your own invite. Switch to a tenant wallet."
                      : blocked
                        ? "Repay what you owe the pool first"
                        : forOtherWallet
                        ? `This invite is for ${shortAddress(policy.tenant)}`
                        : !agreed
                          ? "Tick the box above first"
                          : null
                  }
                  run={(opts) => dataSource.acceptInvite(policy.id, opts)}
                  onDone={() => setJustAccepted(true)}
                />
              </div>
            </Panel>
          )}
          <p className="t-small text-muted">
            Not your invite? <Link href="/tenant" className="font-semibold text-brand-700 hover:underline decoration-2 underline-offset-[3px]">See your guarantees</Link>
          </p>
        </div>

        <div className="lg:sticky lg:top-24">
          <Certificate policy={policy} stamp={justAccepted} fee={fee} />
        </div>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="t-small text-muted">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
