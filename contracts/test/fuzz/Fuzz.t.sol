// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {Debt, ClaimType} from "../../src/libraries/Types.sol";
import "../../src/libraries/Errors.sol";

contract FuzzTest is BaseTest {
    function setUp() public override {
        super.setUp();
        _deposit(investor, 5_000 * USDG);
    }

    function testFuzz_quoteBounds(uint256 coverage, bool sixMonths, uint8 tier) public view {
        coverage = bound(coverage, 1, 10_000e6);
        tier = uint8(bound(tier, 0, 2));
        uint32 periods = sixMonths ? 6 : 12;
        (uint256 monthly, uint256 annual) = calc.quote(coverage, periods, tier);
        assertGe(monthly, 5e6, "minimum fee");
        assertEq(monthly % 1e4, 0, "whole cents");
        // Never more than 9% × 1.1 × 1.3 of coverage per year, plus rounding.
        assertLe(annual, coverage * 1287 / 10_000 + 1e4);
    }

    function testFuzz_premiumSplitSumsExactly(uint256 amount) public view {
        amount = bound(amount, 0, 1e30);
        (uint256 toPool, uint256 toFirstLoss, uint256 toTreasury) = pm.splitPremium(amount);
        assertEq(toPool + toFirstLoss + toTreasury, amount);
        assertEq(toPool, amount - amount * 2_500 / 10_000);
    }

    function testFuzz_depositRedeemNoFreeValue(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000 * USDG);
        uint256 shares = _deposit(stranger, amount);
        vm.prank(stranger);
        uint256 out = pool.redeem(shares, stranger, stranger);
        assertLe(out, amount, "never more than deposited");
        assertApproxEqAbs(out, amount, 1);
    }

    function testFuzz_withdrawNeverBreaksReserve(uint256 depositAmt, uint256 withdrawAmt) public {
        depositAmt = bound(depositAmt, 1_000 * USDG, 50_000 * USDG);
        _deposit(stranger, depositAmt);
        _active(COVER, 12);
        withdrawAmt = bound(withdrawAmt, 1, depositAmt);
        vm.prank(stranger);
        try pool.withdraw(withdrawAmt, stranger, stranger) {
            assertGe(pool.totalAssets(), pool.requiredReserve(pool.activeCoverage()));
        } catch {
            assertGt(withdrawAmt, pool.maxWithdraw(stranger));
        }
    }

    function testFuzz_claimWithinCoverage(uint128 amount) public {
        uint256 id = _ended(COVER, 12);
        vm.prank(landlord);
        if (amount == 0) {
            vm.expectRevert(ZeroAmount.selector);
        } else if (amount > COVER) {
            vm.expectRevert(AmountExceedsCoverage.selector);
        }
        cm.fileClaim(id, ClaimType.Damage, amount, "", CHECK_OUT, "x");
    }

    function testFuzz_resolveDebtMatchesDecision(uint128 approved) public {
        (, uint256 claimId) = _disputed(1_000e6);
        approved = uint128(bound(approved, 0, 1_000e6));
        uint256 before = usdg.balanceOf(landlord);
        vm.prank(arbiter);
        cm.resolveDispute(claimId, approved, "decision");
        assertEq(usdg.balanceOf(landlord) - before, approved);
        uint256 expected = approved == 0 ? 0 : approved == 1_000e6 ? approved + 20e6 : approved;
        assertEq(cm.getDebt(claimId).principal, expected);
        assertEq(pool.pendingClaimsLiability(), 0);
    }

    function testFuzz_repayAmounts(uint256 a, uint256 b) public {
        (, uint256 claimId) = _disputed(1_000e6);
        vm.prank(arbiter);
        cm.resolveDispute(claimId, 1_000e6, "full"); // principal 1,020 (fee 20)
        a = bound(a, 1, 2_000e6);
        b = bound(b, 1, 2_000e6);
        uint256 treasuryBefore = usdg.balanceOf(treasury);
        uint256 recoveriesBefore = pool.totalRecoveries();

        vm.prank(tenant);
        cm.repay(claimId, a);
        Debt memory d = cm.getDebt(claimId);
        if (d.repaid < d.principal) {
            vm.prank(tenant);
            cm.repay(claimId, b);
            d = cm.getDebt(claimId);
        }
        assertLe(d.repaid, d.principal, "never overpaid");
        uint256 toPool = pool.totalRecoveries() - recoveriesBefore;
        uint256 toTreasury = usdg.balanceOf(treasury) - treasuryBefore;
        assertEq(toPool + toTreasury, d.repaid);
        assertLe(toPool, 1_000e6, "pool gets at most the approved amount");
        if (toTreasury > 0) assertEq(toPool, 1_000e6, "fee only after the pool is whole");
    }
}
