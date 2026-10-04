// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Premium pricing engine (Stylus or Solidity).
interface IPremiumCalculator {
    /// @param tier 0 = A, 1 = B, 2 = C.
    /// @return monthlyPremium Rounded up to 0.01, floored at the minimum.
    function quote(uint256 coverage, uint32 totalPeriods, uint8 tier)
        external
        view
        returns (uint256 monthlyPremium, uint256 annualPremium);

    /// @return baseRateBps Annual rate in bps (900 = 9%).
    function params() external view returns (uint256 baseRateBps, uint256 minMonthlyPremium, uint256 roundingUnit);
}
