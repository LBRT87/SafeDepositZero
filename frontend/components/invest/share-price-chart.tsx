"use client";

import type { SharePricePoint } from "@/lib/data/types";

/** Minimal line chart of sdUSDG share price. Flat, one color, labelled ends; the dip marks a claim payout. */
export function SharePriceChart({ points }: { points: SharePricePoint[] }) {
  if (points.length < 2) return <p className="text-muted">Not enough history yet.</p>;
  const W = 640;
  const H = 180;
  const pad = { l: 8, r: 64, t: 12, b: 24 };
  const xs = points.map((p) => p.at);
  const ys = points.map((p) => p.price);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys) * 0.998;
  const maxY = Math.max(...ys) * 1.002;
  const x = (v: number) => pad.l + ((v - minX) / Math.max(1, maxX - minX)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - minY) / Math.max(1e-9, maxY - minY)) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Share price from $${first.price.toFixed(4)} to $${last.price.toFixed(4)}`}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="#E2E5E8" />
        <path d={d} fill="none" stroke="var(--color-brand-500)" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={x(last.at)} cy={y(last.price)} r="4" fill="var(--color-brand-700)" />
        <text x={x(last.at) + 10} y={y(last.price) + 4} fontSize="13" fontWeight="600" fill="#14171A" style={{ fontVariantNumeric: "tabular-nums" }}>
          ${last.price.toFixed(4)}
        </text>
        <text x={pad.l} y={H - 6} fontSize="12" fill="#596068">12 months ago</text>
        <text x={W - pad.r} y={H - 6} fontSize="12" fill="#596068" textAnchor="end">Now</text>
      </svg>
      <figcaption className="t-small mt-2 text-muted">
        sdUSDG share price in USDG. It rises with fees, T-bill yield and repayments, and dips when a claim is paid.
      </figcaption>
    </figure>
  );
}
