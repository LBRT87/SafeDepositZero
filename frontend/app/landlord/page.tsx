"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddressTag } from "@/components/address";
import { Countdown } from "@/components/countdown";
import { CreateInvite } from "@/components/landlord/create-invite";
import { PolicyBadge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/ui/panel";
import { DataTable } from "@/components/ui/table";
import { dataSource } from "@/lib/data";
import { useDS, useNow } from "@/lib/hooks";
import { usdg } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Policy } from "@/lib/data/types";

export default function LandlordPage() {
  const router = useRouter();
  const { account } = useSession();
  const now = useNow();
  const [showCreate, setShowCreate] = useState(false);
  const policies = useDS(["policies", "landlord", account], () => dataSource.getPolicies({ landlord: account! }), {
    enabled: !!account,
  });
  const time = useDS(["time"], () => dataSource.getTimeConfig()).data;

  const next = (p: Policy) => {
    if (now === null) return "…";
    const grace = time?.gracePeriod ?? 0;
    switch (p.status) {
      case "Invited":
        return <span className="text-muted">Waiting for tenant</span>;
      case "Active":
        if (p.periodsPaid < p.totalPeriods && now > p.nextPremiumDue + grace)
          return <span className="font-semibold text-alert">Fee overdue</span>;
        if (now >= p.endTime) return <span className="font-semibold text-marigold-ink">Lease ended, end it to open claims</span>;
        return (
          <span>
            Lease ends in <Countdown deadline={p.endTime} />
          </span>
        );
      case "Ended":
        return now > p.claimWindowEnd ? (
          <span className="text-muted">Claim window passed</span>
        ) : (
          <span className="font-semibold text-marigold-ink">
            <Countdown deadline={p.claimWindowEnd} /> left to file a claim
          </span>
        );
      case "Lapsed":
        return now > p.claimWindowEnd ? (
          <span className="text-muted">Claim window passed</span>
        ) : (
          <span className="font-semibold text-alert">
            Fees stopped. <Countdown deadline={p.claimWindowEnd} /> left to claim
          </span>
        );
      case "Claimed":
        return <span>Claim in progress</span>;
      default:
        return <span className="text-muted">—</span>;
    }
  };

  return (
    <div className="page flex flex-col gap-10">
      <PageHeader
        title="Your protected units"
        subtitle="Invite tenants, see what's covered, and file claims after move-out."
        actions={
          !showCreate && account ? (
            <Button onClick={() => setShowCreate(true)}>Create a lease invite</Button>
          ) : undefined
        }
      />

      {!account ? (
        <EmptyState title="Connect your wallet first" body="Your units and claims show up here." />
      ) : (
        <>
          {showCreate && <CreateInvite />}

          {policies.isError ? (
            <Banner tone="alert">We couldn&apos;t load your units. Check your connection and refresh the page.</Banner>
          ) : (
            <Panel title="Units" description="Select a unit to see its certificate, payments and claims.">
              <DataTable
                caption="Your units"
                loading={!policies.data}
                rows={policies.data}
                rowKey={(p) => p.id}
                onRowClick={(p) => router.push(`/landlord/${p.id}`)}
                empty={
                  <EmptyState
                    title="No protected units yet."
                    body="Share your operator code with tenants."
                    action={
                      !showCreate ? (
                        <Button variant="secondary" onClick={() => setShowCreate(true)}>
                          Create a lease invite
                        </Button>
                      ) : undefined
                    }
                  />
                }
                columns={[
                  { header: "Unit", cell: (p) => <span className="font-semibold">{p.propertyRef}</span> },
                  { header: "Tenant", cell: (p) => <AddressTag address={p.tenant} /> },
                  { header: "Coverage", align: "right", cell: (p) => usdg(p.coverage) },
                  { header: "Status", cell: (p) => <PolicyBadge status={p.status} windowPassed={now !== null && p.status === "Ended" && now > p.claimWindowEnd} /> },
                  { header: "What's next", wrap: true, cell: next },
                ]}
              />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
