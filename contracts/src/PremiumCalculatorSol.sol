// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPremiumCalculator} from "./interfaces/IPremiumCalculator.sol";
import {InvalidTier, InvalidPeriods, ParamOutOfBounds} from "./libraries/Errors.sol";

/// @title PremiumCalculatorSol
/// @notice Solidity fallback of the Stylus `PremiumCalculator` (stylus/premium-calculator). Same ABI, same math:
///
///   annualPremium  = coverage × baseRateBps × termFactor × tierMultiplier / 10_000 / 100 / 100
///   monthlyPremium = max(annualPremium / 12, minMonthlyPremium)      (both rounded up to 0.01 token)
///
/// termFactor (×100):  totalPeriods ≥ 24 → 95 · 12–23 → 100 · 6–11 → 110 · < 6 → 100
///   (< 6 periods only exists in the demo profile and is priced at the standard 12-month factor.)
/// tierMultiplier (×100): A → 80 · B → 100 · C → 130
contract PremiumCalculatorSol is IPremiumCalculator {
    uint256 public constant BASE_RATE_BPS = 900;
    uint256 private constant DENOMINATOR = 10_000 * 100 * 100; // bps × termFactor scale × tier scale

    uint256 public immutable minMonthlyPremium;
    uint256 public immutable roundingUnit;

    /// @param tokenDecimals Decimals of the premium token (USDG = 6). Must be ≥ 2 so 0.01 token is representable.
    constructor(uint8 tokenDecimals) {
        if (tokenDecimals < 2 || tokenDecimals > 30) revert ParamOutOfBounds();
        minMonthlyPremium = 5 * 10 ** tokenDecimals;
        roundingUnit = 10 ** (tokenDecimals - 2);
    }

    /// @inheritdoc IPremiumCalculator
    function quote(uint256 coverage, uint32 totalPeriods, uint8 tier)
        external
        view
        returns (uint256 monthlyPremium, uint256 annualPremium)
    {
        if (totalPeriods == 0) revert InvalidPeriods();
        uint256 numerator = coverage * BASE_RATE_BPS * termFactor(totalPeriods) * tierMultiplier(tier);

        annualPremium = _ceilDiv(numerator, DENOMINATOR * roundingUnit) * roundingUnit;
        monthlyPremium = _ceilDiv(numerator, DENOMINATOR * 12 * roundingUnit) * roundingUnit;
        if (monthlyPremium < minMonthlyPremium) monthlyPremium = minMonthlyPremium;
    }

    /// @inheritdoc IPremiumCalculator
    function params() external view returns (uint256, uint256, uint256) {
        return (BASE_RATE_BPS, minMonthlyPremium, roundingUnit);
    }

    function termFactor(uint32 totalPeriods) public pure returns (uint256) {
        if (totalPeriods >= 24) return 95;
        if (totalPeriods >= 12) return 100;
        if (totalPeriods >= 6) return 110;
        return 100;
    }

    function tierMultiplier(uint8 tier) public pure returns (uint256) {
        if (tier == 0) return 80;
        if (tier == 1) return 100;
        if (tier == 2) return 130;
        revert InvalidTier();
    }

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }
}
