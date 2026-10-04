//! SafeDeposit Zero premium calculator on Arbitrum Stylus. Same ABI as IPremiumCalculator.
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

pub mod math;

use alloc::vec::Vec;
use alloy_primitives::U256;
use alloy_sol_types::sol;
use stylus_sdk::prelude::*;
use stylus_sdk::storage::StorageU256;

sol! {
    error InvalidTier();
    error InvalidPeriods();
    error ParamOutOfBounds();
    error Overflow();
}

#[derive(SolidityError)]
pub enum PremiumError {
    InvalidTier(InvalidTier),
    InvalidPeriods(InvalidPeriods),
    ParamOutOfBounds(ParamOutOfBounds),
    Overflow(Overflow),
}

impl From<math::QuoteError> for PremiumError {
    fn from(e: math::QuoteError) -> Self {
        match e {
            math::QuoteError::InvalidTier => PremiumError::InvalidTier(InvalidTier {}),
            math::QuoteError::InvalidPeriods => PremiumError::InvalidPeriods(InvalidPeriods {}),
            math::QuoteError::Overflow => PremiumError::Overflow(Overflow {}),
        }
    }
}

#[storage]
#[entrypoint]
pub struct PremiumCalculator {
    min_monthly_premium: StorageU256,
    rounding_unit: StorageU256,
}

#[public]
impl PremiumCalculator {
    /// Premium token decimals (USDG = 6).
    #[constructor]
    pub fn constructor(&mut self, token_decimals: u8) -> Result<(), PremiumError> {
        if !(2..=30).contains(&token_decimals) {
            return Err(PremiumError::ParamOutOfBounds(ParamOutOfBounds {}));
        }
        let ten = U256::from(10u64);
        let unit = ten.pow(U256::from(token_decimals));
        self.min_monthly_premium.set(U256::from(5u64) * unit);
        self.rounding_unit.set(ten.pow(U256::from(token_decimals - 2)));
        Ok(())
    }

    pub fn quote(&self, coverage: U256, total_periods: u32, tier: u8) -> Result<(U256, U256), PremiumError> {
        Ok(math::quote(
            coverage,
            total_periods,
            tier,
            self.min_monthly_premium.get(),
            self.rounding_unit.get(),
        )?)
    }

    pub fn params(&self) -> (U256, U256, U256) {
        (
            U256::from(math::BASE_RATE_BPS),
            self.min_monthly_premium.get(),
            self.rounding_unit.get(),
        )
    }
}

#[cfg(test)]
mod contract_tests {
    use super::*;
    use stylus_sdk::testing::*;

    #[test]
    fn constructor_and_quote() {
        let vm = TestVM::default();
        let mut c = PremiumCalculator::from(&vm);
        assert!(c.constructor(6).is_ok());
        let (monthly, annual) = c.quote(U256::from(2_000_000_000u64), 12, 1).ok().unwrap();
        assert_eq!(monthly, U256::from(15_000_000u64));
        assert_eq!(annual, U256::from(180_000_000u64));
        let (base, min, unit) = c.params();
        assert_eq!(base, U256::from(900u64));
        assert_eq!(min, U256::from(5_000_000u64));
        assert_eq!(unit, U256::from(10_000u64));
    }

    #[test]
    fn constructor_rejects_bad_decimals() {
        let vm = TestVM::default();
        let mut c = PremiumCalculator::from(&vm);
        assert!(c.constructor(1).is_err());
    }

    #[test]
    fn quote_reverts_on_invalid_tier() {
        let vm = TestVM::default();
        let mut c = PremiumCalculator::from(&vm);
        c.constructor(6).ok().unwrap();
        assert!(c.quote(U256::from(1u64), 12, 7).is_err());
    }
}
