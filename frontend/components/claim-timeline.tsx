import { clsx } from "clsx";
import { ExplorerLink } from "./explorer-link";
import { timeDate } from "@/lib/format";
import type { Claim } from "@/lib/data/types";

/** Filed → Tenant responded → Arbiter decision → Paid, each with its tx. Upcoming steps shown muted. */
export function ClaimTimeline({ claim }: { claim: Claim }) {
  const done = claim.timeline;
  const upcoming: string[] = [];
  if (claim.status === "Filed") upcoming.push("Tenant responds", "Pool pays the landlord");
  if (claim.status === "Disputed") upcoming.push("Arbiter decides", "Pool pays the landlord");

  return (
    <ol className="relative flex flex-col gap-5 pl-6">
      <span aria-hidden className="absolute bottom-2 left-[7px] top-2 w-0.5 bg-line" />
      {done.map((t, i) => (
        <li key={i} className="relative">
          <span aria-hidden className="absolute -left-6 top-1 size-4 rounded-full border-2 border-white bg-brand-700" />
          <div className="font-semibold">{t.label}</div>
          <div className="t-small mt-0.5 flex flex-wrap gap-x-3 text-muted">
            <span className="nums">{timeDate(t.at)}</span>
            {t.txHash && <ExplorerLink hash={t.txHash} />}
          </div>
        </li>
      ))}
      {upcoming.map((label) => (
        <li key={label} className="relative">
          <span aria-hidden className={clsx("absolute -left-6 top-1 size-4 rounded-full border-2 border-line bg-white")} />
          <div className="text-muted">{label}</div>
        </li>
      ))}
    </ol>
  );
}
