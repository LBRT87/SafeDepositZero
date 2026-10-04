"use client";

import { Check, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useId, useState } from "react";
import { isAddress } from "viem";
import { EvidenceUpload } from "../evidence";
import { TxAction } from "../tx-action";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { AmountInput, Field, Input, Select } from "../ui/field";
import { Panel } from "../ui/panel";
import { dataSource } from "@/lib/data";
import { useDS, useTimeConfig } from "@/lib/hooks";
import { parseAmount, term, usdg } from "@/lib/format";
import { TIER_COPY } from "@/lib/premium";
import { useSession } from "@/lib/session";
import { TERMS, type Address, type EvidenceBundle } from "@/lib/data/types";

const MAX_COVERAGE = 10_000_000_000n;

export function CreateInvite({ onCreated }: { onCreated?: (id: number) => void }) {
  const time = useTimeConfig();
  const { account } = useSession();
  const ids = { prop: useId(), tenant: useId(), rent: useId(), cov: useId(), len: useId() };
  const [property, setProperty] = useState("Unit 12B, Orchard");
  const [tenant, setTenant] = useState("");
  const [rent, setRent] = useState("2,000");
  const [coverage, setCoverage] = useState("2,000");
  const [periods, setPeriods] = useState("12");
  const [checkIn, setCheckIn] = useState<EvidenceBundle | null>(null);
  const [created, setCreated] = useState<number | null>(null);

  const cov = parseAmount(coverage);
  const rentAmt = parseAmount(rent);
  const { data: q } = useDS(["quote", cov?.toString(), periods, "B"], () => dataSource.quote(cov ?? 0n, Number(periods), "B"), {
    enabled: !!cov,
  });
  const { data: room } = useDS(["maxNewCoverage", account], () => dataSource.maxNewCoverage(account!), { enabled: !!account });
  const { data: pool } = useDS(["pool"], () => dataSource.getPoolStats());

  const errors = {
    property: !property.trim() ? "Add a short label for the unit." : new TextEncoder().encode(property).length > 64 ? "Keep it under 64 characters." : null,
    tenant: tenant && !isAddress(tenant) ? "That isn't a valid wallet address. Leave it empty to share a link instead." : null,
    coverage: !cov ? "Enter the deposit you'd normally ask for." : cov > MAX_COVERAGE ? "The limit is 10,000 USDG per lease." : null,
    rent: rentAmt === null ? "Enter the monthly rent." : null,
  };
  const firstError = Object.values(errors).find(Boolean) ?? null;
  const overRoom = cov !== null && room !== undefined && cov > room;
  const capacityReason = overRoom
    ? room === 0n
      ? "The pool can't back a new guarantee for you right now"
      : `The pool can back up to ${usdg(room)} more for you right now`
    : null;

  if (created !== null) return <InviteCreated id={created} onAnother={() => setCreated(null)} />;

  return (
    <Panel id="create" title="Create a lease invite" description="Your tenant pays a small monthly fee instead of a deposit. You stay covered up to the amount you set.">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Property" htmlFor={ids.prop} error={property ? errors.property : null} className="sm:col-span-2">
            <Input id={ids.prop} value={property} onChange={(e) => setProperty(e.target.value)} maxLength={64} />
          </Field>
          <Field
            label="Tenant wallet (optional)"
            htmlFor={ids.tenant}
            error={errors.tenant}
            helper="Leave empty to get a shareable invite link anyone can accept."
            className="sm:col-span-2"
          >
            <Input id={ids.tenant} value={tenant} onChange={(e) => setTenant(e.target.value.trim())} placeholder="0x…" className="t-mono" />
          </Field>
          <Field label="Monthly rent" htmlFor={ids.rent} error={rent ? errors.rent : null}>
            <AmountInput id={ids.rent} value={rent} onChange={setRent} invalid={!!(rent && errors.rent)} />
          </Field>
          <Field
            label="Deposit to guarantee"
            htmlFor={ids.cov}
            error={coverage ? errors.coverage : null}
            helper={room !== undefined ? `Up to 10,000 USDG per lease. The pool can back ${usdg(room)} more for you.` : "Up to 10,000 USDG per lease."}
          >
            <AmountInput id={ids.cov} value={coverage} onChange={setCoverage} invalid={!!(coverage && errors.coverage) || overRoom} />
          </Field>
          <Field label="Lease length" htmlFor={ids.len} className="sm:col-span-2">
            <Select id={ids.len} value={periods} onChange={(e) => setPeriods(e.target.value)}>
              {TERMS.map((n) => (
                <option key={n} value={n}>
                  {term(n, time)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <EvidenceUpload
              label="Check-in photos"
              helper="Pinned to IPFS. Only the manifest's CID and fingerprint go on-chain."
              value={checkIn}
              onChange={setCheckIn}
            />
          </div>
        </div>

        <div className="flex flex-col gap-5 rounded-panel bg-paper p-5">
          <div>
            <div className="t-small text-muted">A new renter pays</div>
            <div className="t-amount-xl mt-1 text-green-700">{q ? usdg(q.monthlyPremium).replace(" USDG", "") : "…"}</div>
            <div className="t-small text-muted">per month, instead of a {cov ? usdg(cov) : "…"} deposit</div>
          </div>
          <p className="t-small text-muted">
            The fee is set when your tenant accepts, from their rental history on SafeDeposit Zero. {TIER_COPY.A.label}: 20% less.{" "}
            {TIER_COPY.C.label}: 30% more.
          </p>
          <div>
            <div className="t-small text-muted">You&apos;re covered up to</div>
            <div className="t-amount-l mt-1">{cov ? usdg(cov) : "…"}</div>
          </div>
          {pool?.paused ? (
            <Banner tone="alert">New guarantees are paused by the protocol admin. Existing guarantees and claims still work.</Banner>
          ) : overRoom ? (
            <Banner tone="alert">
              {room === 0n
                ? "The pool is at its minimum reserve or your share of it is full, so it can't back another guarantee for you right now."
                : `The pool can back up to ${usdg(room!)} more for you: it keeps a 50% reserve and limits how much backs one landlord.`}
            </Banner>
          ) : null}
          <TxAction
            label="Create invite"
            successTitle="Invite created"
            disabledReason={firstError ?? (pool?.paused ? "New guarantees are paused" : capacityReason)}
            run={async (opts) => {
              if (checkIn) await dataSource.storeEvidence(checkIn);
              return dataSource.createInvite(
                {
                  tenant: tenant ? (tenant as Address) : null,
                  propertyRef: property.trim(),
                  monthlyRent: rentAmt ?? 0n,
                  coverage: cov ?? 0n,
                  totalPeriods: Number(periods),
                  checkIn,
                },
                opts,
              );
            }}
            onDone={(r) => {
              const id = (r as { policyId?: number }).policyId ?? null;
              setCreated(id);
              if (id !== null) onCreated?.(id);
            }}
          />
        </div>
      </div>
    </Panel>
  );
}

function InviteCreated({ id, onAnother }: { id: number; onAnother: () => void }) {
  // Client-only, so window exists.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const [copied, setCopied] = useState(false);
  const link = `${origin}/invite/${id}`;
  return (
    <Panel title="Invite created" description="Send this link to your tenant. They accept it and pay the first monthly fee.">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="rounded-btn border border-line bg-white p-3">
          {origin && <QRCodeSVG value={link} size={132} fgColor="#14171A" />}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="t-mono break-all rounded-btn bg-paper px-3 py-2.5">{link}</div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={copied ? <Check /> : <Copy />}
              onClick={() => {
                navigator.clipboard?.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1_500);
              }}
            >
              {copied ? "Link copied" : "Copy invite link"}
            </Button>
            <Button variant="ghost" onClick={onAnother}>
              Create another invite
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
