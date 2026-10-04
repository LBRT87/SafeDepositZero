import { clsx } from "clsx";
import { pct } from "@/lib/format";

/** Reserve ratio meter with a tick at the minimum. */
export function ReserveMeter({ ratioBps, minBps }: { ratioBps: number | null; minBps: number }) {
  const scaleMax = Math.max(25_000, (ratioBps ?? 0) * 1.1);
  const ratio = ratioBps ?? scaleMax;
  const fill = Math.min(100, (ratio / scaleMax) * 100);
  const minPos = (minBps / scaleMax) * 100;
  const below = ratioBps !== null && ratioBps < minBps;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="t-small text-muted">Reserve ratio</span>
        <span className={clsx("t-amount-l", below ? "text-alert" : "text-green-700")}>
          {ratioBps === null ? "No active coverage" : pct(ratioBps)}
        </span>
      </div>
      <div
        className="relative mt-3 h-3 rounded-full bg-ghost"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={scaleMax / 100}
        aria-valuenow={ratio / 100}
        aria-label="Reserve ratio"
      >
        <div
          className={clsx("h-full rounded-full transition-[width,background-color] duration-700 ease-out", below ? "bg-alert" : "bg-green-500")}
          style={{ width: `${fill}%` }}
        />
        <div className="absolute -top-1.5 h-6 w-0.5 bg-ink" style={{ left: `${minPos}%` }} aria-hidden />
      </div>
      <div className="relative mt-2 h-4">
        <span className="t-small absolute -translate-x-1/2 whitespace-nowrap text-ink" style={{ left: `${minPos}%` }}>
          minimum {pct(minBps)}
        </span>
      </div>
      <p className="t-small mt-3 text-muted">Guarantees pause automatically if this drops below {pct(minBps)}.</p>
    </div>
  );
}
