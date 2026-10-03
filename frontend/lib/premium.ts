// Same integer math as PremiumCalculatorSol and the Stylus PremiumCalculator (SPEC §4.3).
// Used by the mock data source; in onchain mode the quote comes from the contract.

import type { RiskTier } from "./data/types";

export const USDG_DECIMALS = 6;
export const UNIT = 10n ** BigInt(USDG_DECIMALS);
const BASE_RATE_BPS = 900n;
const DENOMINATOR = 10_000n * 100n * 100n;
const ROUNDING = 10n ** BigInt(USDG_DECIMALS - 2); // 0.01 USDG
export const MIN_MONTHLY = 5n * UNIT;
export const PROTOCOL_FEE_BPS = 2_500n;
export const FIRST_LOSS_SHARE_BPS = 4_000n;

export function termFactor(periods: number): bigint {
  if (periods >= 24) return 95n;
  if (periods >= 12) return 100n;
  if (periods >= 6) return 110n;
  return 100n;
}

export function tierMultiplier(tier: RiskTier): bigint {
  return tier === "A" ? 80n : tier === "B" ? 100n : 130n;
}

const ceilDiv = (a: bigint, b: bigint) => (a === 0n ? 0n : (a - 1n) / b + 1n);

export function quotePremium(coverage: bigint, periods: number, tier: RiskTier) {
  const numerator = coverage * BASE_RATE_BPS * termFactor(periods) * tierMultiplier(tier);
  const annualPremium = ceilDiv(numerator, DENOMINATOR * ROUNDING) * ROUNDING;
  let monthlyPremium = ceilDiv(numerator, DENOMINATOR * 12n * ROUNDING) * ROUNDING;
  if (monthlyPremium < MIN_MONTHLY) monthlyPremium = MIN_MONTHLY;
  return { monthlyPremium, annualPremium };
}

/**
 * 75% to the pool; of the 25% protocol fee, 40% (10% of the premium) goes to the first-loss reserve until it
 * reaches its cap (`firstLossRoom`), the rest to the treasury.
 */
export function splitPremium(amount: bigint, firstLossRoom: bigint = amount, feeBps = PROTOCOL_FEE_BPS, flShareBps = FIRST_LOSS_SHARE_BPS) {
  const fee = (amount * feeBps) / 10_000n;
  const wantFirstLoss = (fee * flShareBps) / 10_000n;
  const toFirstLoss = wantFirstLoss < firstLossRoom ? wantFirstLoss : firstLossRoom;
  return { toPool: amount - fee, toFirstLoss, toTreasury: fee - toFirstLoss };
}

/** Tier comes from the tenant's on-chain rental history, never from the landlord. */
export const TIER_COPY: Record<RiskTier, { label: string; help: string }> = {
  A: { label: "Tier A, clean history", help: "At least one lease ended with no claim. 20% off the standard rate." },
  B: { label: "Tier B, standard rate", help: "New renters on SafeDeposit Zero pay the standard rate." },
  C: { label: "Tier C, past claim", help: "A past claim was paid by the pool. 30% above the standard rate." },
};

export const TIER_EXPLAINER =
  "Your fee depends on your rental history on SafeDeposit Zero: new renters pay the standard rate, clean history gets 20% off.";

/** Dispute fee: 2% of the claimed amount, at least 10 USDG. Charged only when the arbiter approves it in full. */
export function disputeFee(claimed: bigint): bigint {
  const fee = (claimed * 200n) / 10_000n;
  const min = 10n * UNIT;
  return fee < min ? min : fee;
}
