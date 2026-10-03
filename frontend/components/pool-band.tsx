"use client";

import Link from "next/link";
import { dataSource } from "@/lib/data";
import { useDS } from "@/lib/hooks";
import { toNumber } from "@/lib/format";
import { CountUp } from "./landing/motion";
import { Skeleton } from "./ui/panel";

/**
 * Full-width deep-green band (green-700) so white text passes AA at every size.
 */
export function PoolBand() {
  const { data: s } = useDS(["pool"], () => dataSource.getPoolStats(), { refetchInterval: 5_000 });
  const whole = (v: number) => Math.round(v).toLocaleString("en-US");
  const figures = s
    ? [
        { label: "Active guarantees", value: s.activeGuarantees, format: whole },
        { label: "Pool assets", value: toNumber(s.totalAssets), format: (v: number) => `$${whole(v)}` },
        {
          label: "Reserve ratio",
          value: s.reserveRatioBps === null ? 0 : s.reserveRatioBps / 100,
          format: (v: number) => (s.reserveRatioBps === null ? "—" : `${Math.round(v)}%`),
          sub: `minimum ${s.minReserveBps / 100}%`,
        },
        { label: "Investor APY", value: s.apy.netApy * 100, format: (v: number) => `${v.toFixed(1)}%` },
      ]
    : null;
  return (
    <section className="bg-green-700">
      <div className="page py-16 md:py-20">
        <h2 className="t-h2 text-white">Every dollar in the pool is on-chain.</h2>
        <dl className="mt-10 grid grid-cols-2 gap-8 md:grid-cols-4">
          {figures
            ? figures.map((f) => (
                <div key={f.label}>
                  <dt className="t-small font-semibold text-white/90">{f.label}</dt>
                  <dd className="t-amount-xl mt-2 text-white">
                    <CountUp value={f.value} format={f.format} />
                  </dd>
                  {f.sub && <dd className="t-small mt-1 text-white/90">{f.sub}</dd>}
                </div>
              ))
            : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 bg-white/15" />)}
        </dl>
        <Link
          href="/invest#apy"
          className="mt-10 inline-block rounded-btn text-[15px] font-semibold text-white underline decoration-2 underline-offset-[3px] hover:decoration-white/60"
        >
          How we calculate APY
        </Link>
      </div>
    </section>
  );
}
