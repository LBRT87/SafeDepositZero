"use client";

import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, Skeleton } from "@/components/ui/panel";
import { DataTable } from "@/components/ui/table";
import { PolicyBadge } from "@/components/ui/badge";
import { Countdown } from "@/components/countdown";
import { CertificateSkeleton } from "@/components/certificate";
import { TableSkeleton } from "@/components/ui/table";
import { DebtCard } from "@/components/tenant/debt-card";
import { GuaranteeCard } from "@/components/tenant/guarantee-card";
import { QuotePanel } from "@/components/tenant/quote-panel";
import { TenantClaimCard } from "@/components/tenant/claim-card";
import { KNOWN_NAMES } from "@/lib/data/mock";
import { dataSource, IS_MOCK } from "@/lib/data";
import { useDS } from "@/lib/hooks";
import { money, shortAddress, timeDate, usdg } from "@/lib/format";
import { TIER_COPY, TIER_EXPLAINER } from "@/lib/premium";
import type { TenantHistory } from "@/lib/data/types";
import { useSession } from "@/lib/session";

export default function TenantPage() {
  const { account } = useSession();
  const enabled = !!account;
  const policies = useDS(["policies", "tenant", account], () => dataSource.getPolicies({ tenant: account! }), { enabled });
  const claims = useDS(["claims", "tenant", account], () => dataSource.getClaims({ tenant: account! }), { enabled });
  const debts = useDS(["debts", account], () => dataSource.getDebts(account!), { enabled });
  const history = useDS(["tenantHistory", account], () => dataSource.getTenantHistory(account!), { enabled });

  const header = (
    <PageHeader title="Your guarantees" subtitle="Pay your monthly fee, follow your lease, and respond to claims." />
  );

  if (!account) {
    return (
      <div className="page">
        {header}
        <EmptyState title="Connect your wallet first" body="Your guarantees, claims and repayments show up here." />
      </div>
    );
  }

  if (policies.isError || claims.isError || debts.isError) {
    return (
      <div className="page">
        {header}
        <Banner tone="alert">We couldn&apos;t load your guarantees. Check your connection and refresh the page.</Banner>
      </div>
    );
  }

  const loading = !policies.data || !claims.data || !debts.data;
  const current = policies.data?.filter((p) => ["Active", "Lapsed", "Ended", "Claimed"].includes(p.status)) ?? [];
  const past = policies.data?.filter((p) => p.status === "Closed") ?? [];
  const byId = new Map(policies.data?.map((p) => [p.id, p]) ?? []);
  const openClaims = claims.data?.filter((c) => c.status === "Filed" || c.status === "Disputed") ?? [];
  const settledClaims = claims.data?.filter((c) => !["Filed", "Disputed"].includes(c.status)) ?? [];
  const openDebts = debts.data?.filter((d) => d.principal > d.repaid) ?? [];
  const nothing = !loading && policies.data!.length === 0 && debts.data!.length === 0;

  return (
    <div className="page flex flex-col gap-10">
      {header}

      {openClaims
        .filter((c) => c.status === "Filed")
        .map((c) => {
          const p = byId.get(c.policyId);
          const landlord = p ? (IS_MOCK && KNOWN_NAMES[p.landlord.toLowerCase()]) || shortAddress(p.landlord) : "Your landlord";
          return (
            <Banner
              key={c.id}
              tone="marigold"
              live
              action={<ButtonLink href={`#claim-${c.id}`} size="sm">Review the claim</ButtonLink>}
            >
              <span className="block">
                {landlord} filed a damage claim of {money(c.amountClaimed)}. Respond by {timeDate(c.responseDeadline)}.
              </span>
              <span className="t-small block text-muted">
                Time left: <Countdown deadline={c.responseDeadline} passed="none" />. If you don&apos;t respond, the claim
                is accepted.
              </span>
            </Banner>
          );
        })}

      {loading ? (
        <div className="flex flex-col gap-6" aria-busy aria-label="Loading your guarantees">
          <Skeleton className="h-8 w-60" />
          <div className="grid grid-cols-1 gap-8 rounded-panel border border-line bg-surface p-6 xl:grid-cols-[560px_1fr]">
            <CertificateSkeleton />
            <TableSkeleton columns={4} rows={6} />
          </div>
        </div>
      ) : nothing ? (
        <EmptyState
          title="You don't have a guarantee yet."
          body="Get a quote to move in without a deposit. Ask your landlord for an invite link, or try the demo invite."
          action={
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="#quote">Get a quote</ButtonLink>
              <ButtonLink href="/invite/1" variant="secondary">
                Try the demo invite
              </ButtonLink>
            </div>
          }
        />
      ) : (
        <>
          {current.length > 0 && (
            <section className="flex flex-col gap-6">
              <h2 className="t-h2">Current lease{current.length > 1 ? "s" : ""}</h2>
              {current.map((p) => (
                <GuaranteeCard key={p.id} policy={p} />
              ))}
            </section>
          )}

          {openClaims.length > 0 && (
            <section className="flex flex-col gap-6">
              <h2 className="t-h2">Claims on your lease</h2>
              {openClaims.map((c) => (
                <TenantClaimCard key={c.id} claim={c} policy={byId.get(c.policyId)!} />
              ))}
            </section>
          )}

          {openDebts.length > 0 && (
            <section className="flex flex-col gap-6">
              <h2 className="t-h2">Repayments</h2>
              {openDebts.map((d) => (
                <DebtCard key={d.claimId} debt={d} policy={byId.get(d.policyId)} />
              ))}
            </section>
          )}

          {history.data && <HistoryPanel history={history.data} />}

          {(past.length > 0 || settledClaims.length > 0) && (
            <Panel title="Past leases">
              <DataTable
                caption="Past leases"
                rows={past}
                rowKey={(p) => p.id}
                columns={[
                  { header: "Property", cell: (p) => <span className="font-semibold">{p.propertyRef}</span> },
                  { header: "Coverage", align: "right", cell: (p) => usdg(p.coverage) },
                  { header: "Ended", cell: (p) => <span className="nums">{timeDate(p.endTime)}</span> },
                  {
                    header: "Claim",
                    cell: (p) => {
                      const c = settledClaims.find((x) => x.policyId === p.id);
                      if (!c) return <span className="text-muted">No claim</span>;
                      return c.status === "Rejected" ? "Rejected" : `${money(c.amountApproved)} paid by the pool`;
                    },
                  },
                  { header: "Status", cell: (p) => <PolicyBadge status={p.status} /> },
                ]}
              />
            </Panel>
          )}
        </>
      )}

      <QuotePanel />
    </div>
  );
}

function HistoryPanel({ history }: { history: TenantHistory }) {
  return (
    <Panel title="Your rental history" description={TIER_EXPLAINER}>
      <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <dt className="t-small text-muted">Your tier for the next lease</dt>
          <dd className="mt-1 font-semibold">{history.blocked ? "Blocked for now" : TIER_COPY[history.tier].label}</dd>
        </div>
        <HistoryFigure label="Leases ended with no claim" value={history.cleanCompleted} />
        <HistoryFigure label="Claims paid by the pool" value={history.claimsPaid} />
        <HistoryFigure label="Open debts" value={history.openDebts} />
      </dl>
      {history.blocked && (
        <Banner tone="marigold" className="mt-6">
          {history.defaulted
            ? "A debt on this wallet was marked as defaulted, so it can't take new guarantees."
            : "Repay what you owe the pool to get new guarantees again. Your next lease would then be priced at tier C."}
        </Banner>
      )}
    </Panel>
  );
}

function HistoryFigure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="t-small text-muted">{label}</dt>
      <dd className="t-amount-l mt-1">{value}</dd>
    </div>
  );
}
