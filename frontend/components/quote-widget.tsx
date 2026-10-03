"use client";

import { useEffect, useId, useState } from "react";
import { dataSource } from "@/lib/data";
import { useDS } from "@/lib/hooks";
import { money, parseAmount, toNumber } from "@/lib/format";
import { useTween } from "./landing/motion";
import { AmountInput, Field, Select } from "./ui/field";
import { Skeleton } from "./ui/panel";

/**
 * Landing quote widget: reads PremiumCalculator.quote through the data source.
 *
 * The page's one authored moment: on first load the monthly fee counts down from the deposit to the fee while its
 * bar shrinks from the deposit's length to the fee's. That is the whole offer: a deposit becomes a small monthly fee.
 * After that, edits tween quickly (feedback). Reduced motion shows the result straight away.
 */
export function QuoteWidget() {
  const [rent, setRent] = useState("2,000");
  const [depositMonths, setDepositMonths] = useState("1");
  const [lease, setLease] = useState("12");
  const ids = { rent: useId(), dep: useId(), lease: useId() };

  const rentAmt = parseAmount(rent) ?? 0n;
  const coverage = (rentAmt * BigInt(Math.round(Number(depositMonths) * 2))) / 2n;
  const { data: quote } = useDS(["quote", coverage.toString(), lease], () => dataSource.quote(coverage, Number(lease), "B"));

  // First result runs the focal sequence (slow, from the deposit); later results are quick feedback.
  const [settled, setSettled] = useState(false);
  const target = quote ? toNumber(quote.monthlyPremium) : null;
  const deposit = toNumber(coverage);
  const fee = useTween(target ?? deposit, { run: target !== null, from: deposit, duration: settled ? 350 : 1400 });
  useEffect(() => {
    if (target === null || settled) return;
    const t = setTimeout(() => setSettled(true), 1500);
    return () => clearTimeout(t);
  }, [target, settled]);
  const ratio = deposit > 0 ? Math.max(fee / deposit, 0.004) : 0;

  return (
    <div className="rounded-panel bg-surface p-5 sm:p-6">
      <h2 className="t-h3">What would you pay?</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Monthly rent" htmlFor={ids.rent} className="sm:col-span-2">
          <AmountInput id={ids.rent} value={rent} onChange={setRent} invalid={parseAmount(rent) === null} />
        </Field>
        <Field label="Deposit your landlord asks for" htmlFor={ids.dep}>
          <Select id={ids.dep} value={depositMonths} onChange={(e) => setDepositMonths(e.target.value)}>
            <option value="1">1 month of rent</option>
            <option value="1.5">1.5 months of rent</option>
            <option value="2">2 months of rent</option>
          </Select>
        </Field>
        <Field label="Lease length" htmlFor={ids.lease}>
          <Select id={ids.lease} value={lease} onChange={(e) => setLease(e.target.value)}>
            <option value="6">6 months</option>
            <option value="12">12 months</option>
          </Select>
        </Field>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5" aria-live="polite">
        <div className="min-w-0">
          <div className="t-small text-muted">Cash you&apos;d lock today</div>
          <div className="t-amount-l mt-2 text-ink">{money(coverage)}</div>
          <div aria-hidden className="mt-3 h-1.5 rounded-full bg-graphite-800" />
        </div>
        <div className="min-w-0">
          <div className="t-small text-muted">Your monthly fee</div>
          {quote ? (
            <>
              <div className="t-amount-xl mt-1 text-green-700">
                <span aria-hidden>${fee.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</span>
                <span className="sr-only">{money(quote.monthlyPremium)}</span>
              </div>
              <div aria-hidden className="mt-2 h-1.5 rounded-full bg-ghost">
                <div className="h-full origin-left rounded-full bg-brand-500" style={{ transform: `scaleX(${ratio})` }} />
              </div>
            </>
          ) : (
            <Skeleton className="mt-2 h-10 w-32" />
          )}
        </div>
      </div>
      <p className="t-small mt-4 text-muted">
        You&apos;re still responsible for damage you cause. Fees depend on lease length and screening.
      </p>
    </div>
  );
}
