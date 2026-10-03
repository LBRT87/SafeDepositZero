"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button, ButtonLink } from "../ui/button";
import { AmountInput, Field, Input, Select } from "../ui/field";
import { Panel } from "../ui/panel";
import { dataSource } from "@/lib/data";
import { useDS, useTimeConfig } from "@/lib/hooks";
import { parseAmount, term, usdg } from "@/lib/format";
import { TIER_COPY } from "@/lib/premium";
import { useSession } from "@/lib/session";
import { TERMS } from "@/lib/data/types";

/**
 * Tenant quote: see the fee and where it goes before asking the landlord for an invite.
 * Guarantees start from a landlord invite on-chain, so the next step is opening the invite.
 */
export function QuotePanel() {
  const router = useRouter();
  const time = useTimeConfig();
  const { account } = useSession();
  const ids = { prop: useId(), landlord: useId(), rent: useId(), dep: useId(), lease: useId(), invite: useId() };
  const [property, setProperty] = useState("");
  const [landlord, setLandlord] = useState("");
  const [rent, setRent] = useState("2,000");
  const [deposit, setDeposit] = useState("2,000");
  const [periods, setPeriods] = useState("12");
  const [invite, setInvite] = useState("");

  const coverage = parseAmount(deposit) ?? 0n;
  const { data: history } = useDS(["tenantHistory", account], () => dataSource.getTenantHistory(account!), { enabled: !!account });
  const tier = history?.tier ?? "B";
  const { data: q } = useDS(["quote", coverage.toString(), periods, tier], () => dataSource.quote(coverage, Number(periods), tier));

  return (
    <Panel
      id="quote"
      title="Get a quote"
      description="See what you'd pay instead of a deposit. Your landlord then sends you an invite with these terms."
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Property" htmlFor={ids.prop} className="sm:col-span-2">
            <Input id={ids.prop} value={property} onChange={(e) => setProperty(e.target.value)} placeholder="Unit 12B, Jl. Sudirman" />
          </Field>
          <Field label="Landlord wallet or operator code" htmlFor={ids.landlord} className="sm:col-span-2" helper="Optional. Helps your landlord find your request.">
            <Input id={ids.landlord} value={landlord} onChange={(e) => setLandlord(e.target.value)} placeholder="0x… or HARBOR-JKT" />
          </Field>
          <Field label="Monthly rent" htmlFor={ids.rent}>
            <AmountInput id={ids.rent} value={rent} onChange={setRent} invalid={parseAmount(rent) === null} />
          </Field>
          <Field label="Deposit amount" htmlFor={ids.dep}>
            <AmountInput id={ids.dep} value={deposit} onChange={setDeposit} invalid={parseAmount(deposit) === null} />
          </Field>
          <Field label="Lease length" htmlFor={ids.lease} className="sm:col-span-2">
            <Select id={ids.lease} value={periods} onChange={(e) => setPeriods(e.target.value)}>
              {TERMS.map((n) => (
                <option key={n} value={n}>
                  {term(n, time)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex flex-col gap-6">
          <table className="w-full border-collapse">
            <caption className="t-label mb-2 text-left">Fee breakdown at {TIER_COPY[tier].label}</caption>
            <tbody>
              <Line label="Monthly fee" value={q ? usdg(q.monthlyPremium) : "…"} strong />
              <Line label="75% to the guarantee pool" value={q ? usdg(q.toPool) : "…"} />
              <Line label="To the first-loss reserve (10% until full)" value={q ? usdg(q.toFirstLoss) : "…"} />
              <Line label="To SafeDeposit Zero" value={q ? usdg(q.toTreasury) : "…"} />
              <Line label="Total over the lease" value={q ? usdg(q.totalCost) : "…"} />
              <Line label="Cash you keep instead of a deposit" value={usdg(coverage)} tone="green" />
            </tbody>
          </table>

          <form
            className="flex flex-col gap-3 border-t border-line pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              const n = invite.replace(/\D/g, "");
              if (n) router.push(`/invite/${n}`);
            }}
          >
            <Field label="Have an invite?" htmlFor={ids.invite} helper="Paste the link or the invite number your landlord sent.">
              <div className="flex gap-2">
                <Input id={ids.invite} value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="/invite/1" />
                <Button type="submit" variant="primary" disabledReason={invite.replace(/\D/g, "") ? null : "Enter an invite number"}>
                  Open invite
                </Button>
              </div>
            </Field>
            <ButtonLink href="/invite/1" variant="link" className="self-start">
              Try the demo invite
            </ButtonLink>
          </form>
        </div>
      </div>
    </Panel>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "green" }) {
  return (
    <tr className="h-11 border-b border-line last:border-b-0">
      <th scope="row" className="pr-4 text-left font-normal text-muted">
        {label}
      </th>
      <td className={"nums text-right " + (strong ? "font-semibold" : "") + (tone === "green" ? " font-semibold text-green-700" : "")}>
        {value}
      </td>
    </tr>
  );
}
