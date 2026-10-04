// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PremiumCalculatorSol} from "../../src/PremiumCalculatorSol.sol";
import {InvalidTier, InvalidPeriods, ParamOutOfBounds} from "../../src/libraries/Errors.sol";

/// @notice Same cases as the Stylus crate tests.
contract PremiumCalculatorTest is Test {
    uint256 constant U = 1e6;
    PremiumCalculatorSol calc;

    function setUp() public {
        calc = new PremiumCalculatorSol(6);
    }

    function _monthly(uint256 coverage, uint32 periods, uint8 tier) internal view returns (uint256 m) {
        (m,) = calc.quote(coverage, periods, tier);
    }

    function test_quote_referenceExample() public view {
        (uint256 monthly, uint256 annual) = calc.quote(2_000 * U, 12, 1);
        assertEq(monthly, 15 * U, "monthly");
        assertEq(annual, 180 * U, "annual");
    }

    function test_quote_tierA() public view {
        assertEq(_monthly(2_000 * U, 12, 0), 12 * U);
    }

    function test_quote_tierC() public view {
        assertEq(_monthly(2_000 * U, 12, 2), 19_500_000);
    }

    function test_quote_sixMonthTermFactor() public view {
        assertEq(_monthly(2_000 * U, 6, 1), 16_500_000);
    }

    function test_quote_twentyFourMonthTermFactor() public view {
        assertEq(_monthly(2_000 * U, 24, 1), 14_250_000);
    }

    function test_quote_demoShortLeaseUsesStandardFactor() public view {
        assertEq(_monthly(2_000 * U, 5, 1), 15 * U);
    }

    function test_quote_minimumPremiumFloor() public view {
        (uint256 monthly, uint256 annual) = calc.quote(500 * U, 12, 0);
        assertEq(monthly, 5 * U, "floored to 5 USDG");
        assertEq(annual, 36 * U, "annual not floored");
    }

    function test_quote_roundsUpToCent() public view {
        // 1,234.567891 × 9% / 12 = 9.259259... → 9.26
        assertEq(_monthly(1_234_567_891, 12, 1), 9_260_000);
    }

    function test_quote_zeroCoverageIsMinimum() public view {
        (uint256 monthly, uint256 annual) = calc.quote(0, 12, 1);
        assertEq(monthly, 5 * U);
        assertEq(annual, 0);
    }

    function test_quote_revertsOnInvalidTier() public {
        vm.expectRevert(InvalidTier.selector);
        calc.quote(2_000 * U, 12, 3);
    }

    function test_quote_revertsOnZeroPeriods() public {
        vm.expectRevert(InvalidPeriods.selector);
        calc.quote(2_000 * U, 0, 1);
    }

    function test_params() public view {
        (uint256 base, uint256 minPremium, uint256 unit) = calc.params();
        assertEq(base, 900);
        assertEq(minPremium, 5 * U);
        assertEq(unit, 10_000);
    }

    function test_constructor_rejectsTooFewDecimals() public {
        vm.expectRevert(ParamOutOfBounds.selector);
        new PremiumCalculatorSol(1);
    }

    function test_constructor_eighteenDecimals() public {
        PremiumCalculatorSol c18 = new PremiumCalculatorSol(18);
        (uint256 monthly,) = c18.quote(2_000e18, 12, 1);
        assertEq(monthly, 15e18);
    }

    function testFuzz_quote_bounds(uint256 coverage, uint32 periods, uint8 tier) public view {
        coverage = bound(coverage, 0, 1e30);
        periods = uint32(bound(periods, 1, 120));
        tier = uint8(bound(tier, 0, 2));
        (uint256 monthly, uint256 annual) = calc.quote(coverage, periods, tier);

        assertGe(monthly, 5 * U, "never below minimum");
        assertEq(monthly % 10_000, 0, "whole cents");
        assertEq(annual % 10_000, 0, "whole cents");
        // Rounded up: never less than the exact value.
        uint256 exactNumerator = coverage * 900 * calc.termFactor(periods) * calc.tierMultiplier(tier);
        assertGe(annual * 1e8, exactNumerator, "annual rounds up");
        assertLt(annual * 1e8, exactNumerator + 1e8 * 10_000, "annual within one cent");
        // Max: 9% × 1.1 × 1.3 = 12.87%/yr.
        assertLe(annual, coverage * 1287 / 10_000 + 10_000);
    }

    function testFuzz_quote_monotonicInCoverage(uint256 a, uint256 b, uint32 periods, uint8 tier) public view {
        a = bound(a, 0, 1e24);
        b = bound(b, a, 1e24);
        periods = uint32(bound(periods, 1, 48));
        tier = uint8(bound(tier, 0, 2));
        assertLe(_monthly(a, periods, tier), _monthly(b, periods, tier));
    }

    function testFuzz_quote_tierOrdering(uint256 coverage, uint32 periods) public view {
        coverage = bound(coverage, 0, 1e24);
        periods = uint32(bound(periods, 1, 48));
        assertLe(_monthly(coverage, periods, 0), _monthly(coverage, periods, 1));
        assertLe(_monthly(coverage, periods, 1), _monthly(coverage, periods, 2));
    }
}
