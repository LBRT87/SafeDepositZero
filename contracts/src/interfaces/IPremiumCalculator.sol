// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Premium pricing engine. Implemented in Rust (Arbitrum Stylus) and as a Solidity fallback
///         (`PremiumCalculatorSol`) with an identical ABI. See build spec §2.3.
interface IPremiumCalculator {
    /// @param coverage     Deposit amount guaranteed, in token base units.
    /// @param totalPeriods Lease length in premium periods (months in prod, minutes in demo).
    /// @param tier         Risk tier: 0 = A, 1 = B, 2 = C.
    /// @return monthlyPremium Fee per period, rounded up to 0.01 token, floored at `minMonthlyPremium`.
    /// @return annualPremium  Annual premium before the minimum, rounded up to 0.01 token.
    function quote(uint256 coverage, uint32 totalPeriods, uint8 tier)
        external
        view
        returns (uint256 monthlyPremium, uint256 annualPremium);

    /// @return baseRateBps       Base annual rate in bps of coverage (900 = 9%).
    /// @return minMonthlyPremium Minimum fee per period in token base units.
    /// @return roundingUnit      0.01 token in base units.
    function params() external view returns (uint256 baseRateBps, uint256 minMonthlyPremium, uint256 roundingUnit);
}
