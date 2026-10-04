//! Pure pricing math, mirrored by PremiumCalculatorSol.

use alloy_primitives::U256;

/// 9% of coverage per year.
pub const BASE_RATE_BPS: u64 = 900;
/// bps (10_000) × termFactor scale (100) × tier scale (100).
const DENOMINATOR: u64 = 10_000 * 100 * 100;

#[derive(Debug, PartialEq, Eq)]
pub enum QuoteError {
    InvalidTier,
    InvalidPeriods,
    Overflow,
}

/// termFactor ×100: ≥24 → 95, 12–23 → 100, 6–11 → 110, <6 → 100.
pub fn term_factor(total_periods: u32) -> u64 {
    match total_periods {
        24.. => 95,
        12..=23 => 100,
        6..=11 => 110,
        _ => 100,
    }
}

/// tierMultiplier ×100: A 80, B 100, C 130.
pub fn tier_multiplier(tier: u8) -> Result<u64, QuoteError> {
    match tier {
        0 => Ok(80),
        1 => Ok(100),
        2 => Ok(130),
        _ => Err(QuoteError::InvalidTier),
    }
}

fn ceil_div(a: U256, b: U256) -> U256 {
    if a.is_zero() {
        U256::ZERO
    } else {
        (a - U256::from(1)) / b + U256::from(1)
    }
}

/// Returns `(monthly, annual)` in base units.
pub fn quote(
    coverage: U256,
    total_periods: u32,
    tier: u8,
    min_monthly: U256,
    rounding_unit: U256,
) -> Result<(U256, U256), QuoteError> {
    if total_periods == 0 {
        return Err(QuoteError::InvalidPeriods);
    }
    let factors = BASE_RATE_BPS * term_factor(total_periods) * tier_multiplier(tier)?;
    let numerator = coverage
        .checked_mul(U256::from(factors))
        .ok_or(QuoteError::Overflow)?;

    let annual_div = U256::from(DENOMINATOR) * rounding_unit;
    let monthly_div = U256::from(DENOMINATOR * 12) * rounding_unit;

    let annual = ceil_div(numerator, annual_div) * rounding_unit;
    let mut monthly = ceil_div(numerator, monthly_div) * rounding_unit;
    if monthly < min_monthly {
        monthly = min_monthly;
    }
    Ok((monthly, annual))
}

#[cfg(test)]
mod tests {
    use super::*;

    const U: u64 = 1_000_000; // 1 USDG (6 decimals)

    fn q(coverage: u64, periods: u32, tier: u8) -> (u64, u64) {
        let (m, a) = quote(
            U256::from(coverage),
            periods,
            tier,
            U256::from(5 * U),
            U256::from(10_000u64),
        )
        .unwrap();
        (m.to::<u64>(), a.to::<u64>())
    }

    /// Same cases as the Solidity tests.
    #[test]
    fn matches_solidity_reference_table() {
        let cases: &[(u64, u32, u8, u64, u64)] = &[
            // coverage, periods, tier, monthly, annual
            (2_000 * U, 12, 1, 15 * U, 180 * U),     // reference example
            (2_000 * U, 12, 0, 12 * U, 144 * U),     // tier A
            (2_000 * U, 12, 2, 19_500_000, 234 * U), // tier C
            (2_000 * U, 6, 1, 16_500_000, 198 * U),  // 6-month factor 1.10
            (2_000 * U, 24, 1, 14_250_000, 171 * U), // 24-month factor 0.95
            (2_000 * U, 5, 1, 15 * U, 180 * U),      // demo short lease
            (500 * U, 12, 0, 5 * U, 36 * U),         // minimum floor
            (1_234_567_891, 12, 1, 9_260_000, 111_120_000), // rounds up to the cent
            (0, 12, 1, 5 * U, 0),                    // zero coverage
        ];
        for &(coverage, periods, tier, monthly, annual) in cases {
            assert_eq!(
                q(coverage, periods, tier),
                (monthly, annual),
                "coverage={coverage} periods={periods} tier={tier}"
            );
        }
    }

    #[test]
    fn rejects_invalid_tier() {
        let r = quote(U256::from(1u64), 12, 3, U256::ZERO, U256::from(1u64));
        assert_eq!(r, Err(QuoteError::InvalidTier));
    }

    #[test]
    fn rejects_zero_periods() {
        let r = quote(U256::from(1u64), 0, 1, U256::ZERO, U256::from(1u64));
        assert_eq!(r, Err(QuoteError::InvalidPeriods));
    }

    #[test]
    fn reports_overflow_instead_of_wrapping() {
        let r = quote(U256::MAX, 12, 2, U256::ZERO, U256::from(1u64));
        assert_eq!(r, Err(QuoteError::Overflow));
    }

    #[test]
    fn eighteen_decimal_token() {
        let e18 = U256::from(10u64).pow(U256::from(18u64));
        let (m, _) = quote(
            U256::from(2_000u64) * e18,
            12,
            1,
            U256::from(5u64) * e18,
            U256::from(10u64).pow(U256::from(16u64)),
        )
        .unwrap();
        assert_eq!(m, U256::from(15u64) * e18);
    }

    #[test]
    fn whole_cents_and_monotonic() {
        let mut prev = 0;
        for c in (0..50_000u64).step_by(997) {
            let (m, a) = q(c * 10_007, 12, 1);
            assert_eq!(m % 10_000, 0);
            assert_eq!(a % 10_000, 0);
            assert!(m >= 5 * U);
            assert!(m >= prev);
            prev = m;
        }
    }

    #[test]
    fn tiers_are_ordered() {
        for periods in [5u32, 6, 12, 24] {
            let a = q(3_000 * U, periods, 0).0;
            let b = q(3_000 * U, periods, 1).0;
            let c = q(3_000 * U, periods, 2).0;
            assert!(a <= b && b <= c);
        }
    }
}
