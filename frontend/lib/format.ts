import { UNIT } from "./premium";
import type { Address, ClaimType, TimeConfig } from "./data/types";

export const CLAIM_TYPE_COPY: Record<ClaimType, string> = {
  Damage: "Damage",
  UnpaidRent: "Unpaid rent",
  Other: "Other",
};

const usd2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** bigint base units → number of USDG (display only). */
export function toNumber(amount: bigint): number {
  return Number(amount) / Number(UNIT);
}

/** "$2,000.00" */
export function money(amount: bigint): string {
  const neg = amount < 0n;
  const s = "$" + usd2.format(Math.abs(toNumber(amount)));
  return neg ? "−" + s : s;
}

/** "$2,000.00 USDG" — detail views. */
export function usdg(amount: bigint): string {
  return `${money(amount)} USDG`;
}

/** "$2,000" — summaries. */
export function moneyShort(amount: bigint): string {
  return "$" + usd0.format(Math.round(toNumber(amount)));
}

/** Plain "2,000.00" for button labels like "Approve 2,000.00 USDG". */
export function plain(amount: bigint): string {
  return usd2.format(toNumber(amount));
}

/** Parses "1,234.56" → base units. Returns null when invalid. */
export function parseAmount(input: string): bigint | null {
  const clean = input.replace(/[,\s$]/g, "");
  if (!/^\d*(\.\d{0,6})?$/.test(clean) || clean === "" || clean === ".") return null;
  const [whole, frac = ""] = clean.split(".");
  return BigInt(whole || "0") * UNIT + BigInt((frac + "000000").slice(0, 6));
}

export function pct(bps: number | null, digits = 0): string {
  if (bps === null) return "—";
  return `${(bps / 100).toFixed(digits)}%`;
}

export function pctFromRatio(r: number, digits = 1): string {
  return `${(r * 100).toFixed(digits)}%`;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "4 Oct 2026" */
export function date(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** "14:32, 4 Oct" */
export function timeDate(ts: number): string {
  const d = new Date(ts * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}, ${d.getDate()} ${months[d.getMonth()]}`;
}

/** Countdown text: "2:05" under an hour, "3h 20m", "4d 6h". */
export function countdown(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Lease length in renter words. Demo profile adds the real-time equivalent. */
export function term(periods: number, time: TimeConfig | undefined): string {
  const base = `${periods} month${periods === 1 ? "" : "s"}`;
  if (!time || time.profile !== "demo") return base;
  return `${base} (${periods} min demo)`;
}

/** "0x1F4d…a92C" */
export function shortAddress(a: Address | string | null | undefined): string {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
