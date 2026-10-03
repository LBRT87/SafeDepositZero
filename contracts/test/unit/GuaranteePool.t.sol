// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {GuaranteePool} from "../../src/GuaranteePool.sol";
import {TBillAdapter} from "../../src/yield/TBillAdapter.sol";
import {MockTBillVault} from "../../src/yield/MockTBillVault.sol";
import {IYieldAdapter} from "../../src/interfaces/IYieldAdapter.sol";
import {MockUSDG} from "../../src/mocks/MockUSDG.sol";
import "../../src/libraries/Errors.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract GuaranteePoolTest is BaseTest {
    function test_GuaranteePool_metadata() public view {
        assertEq(pool.name(), "SafeDeposit Pool Share");
        assertEq(pool.symbol(), "sdUSDG");
        assertEq(pool.asset(), address(usdg));
        assertEq(pool.decimals(), 12, "6 + virtual offset 6");
        assertEq(pool.concentrationFloor(), 20_000e6);
    }

    function test_GuaranteePool_depositMintsShares() public {
        uint256 preview = pool.previewDeposit(5_000 * USDG);
        uint256 shares = _deposit(investor, 5_000 * USDG);
        assertEq(shares, preview);
        assertEq(pool.balanceOf(investor), shares);
        assertEq(pool.totalAssets(), 5_001 * USDG);
    }

    function testRevert_GuaranteePool_depositZero() public {
        vm.expectRevert(ZeroAmount.selector);
        vm.prank(investor);
        pool.deposit(0, investor);
    }

    function testRevert_GuaranteePool_depositPaused() public {
        vm.prank(admin);
        pool.pause();
        assertEq(pool.maxDeposit(investor), 0);
        assertEq(pool.maxMint(investor), 0);
        _mint(investor, 100 * USDG);
        _approveAll(investor);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(investor);
        pool.deposit(100 * USDG, investor);
    }

    function test_GuaranteePool_mint() public {
        _mint(investor, 1_000 * USDG);
        _approveAll(investor);
        uint256 shares = pool.previewDeposit(100 * USDG);
        vm.prank(investor);
        uint256 assets = pool.mint(shares, investor);
        assertEq(assets, 100 * USDG);
    }

    function test_GuaranteePool_withdrawFullWhenNoCoverage() public {
        _deposit(investor, 5_000 * USDG);
        vm.prank(investor);
        pool.withdraw(5_000 * USDG, investor, investor);
        assertEq(usdg.balanceOf(investor), 5_000 * USDG);
    }

    function testRevert_GuaranteePool_withdrawBlockedByReserve() public {
        _deposit(investor, 2_000 * USDG);
        _active(COVER, 12); // needs 1,000 reserve
        uint256 required = 1_000 * USDG;
        uint256 tooMuch = pool.totalAssets() - required + 1;
        vm.expectRevert(abi.encodeWithSelector(ReserveTooLow.selector, required - 1, required));
        vm.prank(investor);
        pool.withdraw(tooMuch, investor, investor);
    }

    function test_GuaranteePool_maxWithdrawRespectsReserve() public {
        _deposit(investor, 2_000 * USDG);
        _active(COVER, 12);
        assertEq(pool.maxWithdraw(investor), pool.totalAssets() - 1_000 * USDG);
        uint256 max = pool.maxWithdraw(investor);
        vm.prank(investor);
        pool.withdraw(max, investor, investor);
        assertEq(pool.totalAssets(), 1_000 * USDG);
        assertEq(pool.maxWithdraw(investor), 0);
    }

    function testRevert_GuaranteePool_redeemBlockedByReserve() public {
        uint256 shares = _deposit(investor, 2_000 * USDG);
        _active(COVER, 12);
        vm.expectRevert();
        vm.prank(investor);
        pool.redeem(shares, investor, investor);
        assertLe(pool.maxRedeem(investor), shares);
    }

    function testRevert_GuaranteePool_redeemZero() public {
        vm.expectRevert(ZeroAmount.selector);
        pool.redeem(0, investor, investor);
    }

    function test_GuaranteePool_excessWithdrawWhilePaused() public {
        _deposit(investor, 2_000 * USDG);
        vm.prank(admin);
        pool.pause();
        vm.prank(investor);
        pool.withdraw(500 * USDG, investor, investor);
        assertEq(usdg.balanceOf(investor), 500 * USDG);
    }

    // ───────────── accounting: first-loss and pending claims ─────────────

    function test_GuaranteePool_firstLossExcludedFromInvestorAssets() public {
        _deposit(investor, 5_000 * USDG);
        _active(COVER, 12);
        assertEq(pool.firstLossBalance(), 1_500_000);
        assertEq(pool.grossAssets() - pool.totalAssets(), 1_500_000);
    }

    function test_GuaranteePool_pendingClaimLowersPriceAndPaymentKeepsIt() public {
        _deposit(investor, 5_000 * USDG);
        uint256 price = _sharePrice();
        vm.prank(address(cm));
        pool.addPendingClaim(500 * USDG);
        assertLt(_sharePrice(), price);
        uint256 lowered = _sharePrice();
        vm.prank(address(cm));
        pool.payClaim(landlord, 500 * USDG);
        assertEq(_sharePrice(), lowered, "payment doesn't move the price again");
        assertEq(pool.pendingClaimsLiability(), 0);
    }

    function test_GuaranteePool_updatePendingClaim() public {
        vm.startPrank(address(cm));
        pool.addPendingClaim(300 * USDG);
        pool.updatePendingClaim(300 * USDG, 200 * USDG);
        vm.stopPrank();
        assertEq(pool.pendingClaimsLiability(), 200 * USDG);
    }

    function testRevert_GuaranteePool_depositWhileUnderwater() public {
        _deposit(investor, 999 * USDG); // 1,000
        vm.prank(address(cm));
        pool.addPendingClaim(1_500 * USDG);
        assertTrue(pool.isUnderwater());
        assertEq(pool.maxDeposit(stranger), 0);
        _mint(stranger, 100 * USDG);
        _approveAll(stranger);
        vm.expectRevert(PoolUnderwater.selector);
        vm.prank(stranger);
        pool.deposit(100 * USDG, stranger);
    }

    function test_GuaranteePool_coverDefaultCappedByBalance() public {
        _deposit(investor, 5_000 * USDG);
        _active(COVER, 12);
        vm.prank(address(cm));
        uint256 covered = pool.coverDefault(100 * USDG);
        assertEq(covered, 1_500_000);
        assertEq(pool.firstLossBalance(), 0);
        assertEq(pool.totalFirstLossCovered(), 1_500_000);
    }

    // ───────────── concentration ─────────────

    function test_GuaranteePool_concentrationViews() public {
        _deposit(investor, 5_000 * USDG); // 5,001
        assertEq(pool.capacity(), 10_002 * USDG);
        assertEq(pool.landlordLimit(), 20_000 * USDG, "floor applies to small pools");
        assertEq(pool.maxNewCoverage(landlord), 10_002 * USDG, "reserve binds first");
        vm.prank(admin);
        pool.setConcentrationFloor(0);
        assertEq(pool.landlordLimit(), 1_000_200_000);
        assertEq(pool.maxNewCoverage(landlord), 1_000_200_000);
    }

    function testRevert_GuaranteePool_increaseCoverageConcentration() public {
        _deposit(investor, 5_000 * USDG);
        vm.prank(admin);
        pool.setConcentrationFloor(0);
        vm.expectRevert(abi.encodeWithSelector(ConcentrationTooHigh.selector, 1_500 * USDG, 1_000_200_000));
        vm.prank(address(pm));
        pool.increaseCoverage(landlord, 1_500 * USDG);
        // A different landlord has its own limit.
        vm.prank(address(pm));
        pool.increaseCoverage(stranger, 1_000 * USDG);
        assertEq(pool.coverageByLandlord(stranger), 1_000 * USDG);
    }

    function testRevert_GuaranteePool_increaseCoverageReserveTooLow() public {
        _deposit(investor, 999 * USDG); // total 1,000
        vm.expectRevert(abi.encodeWithSelector(ReserveTooLow.selector, 1_000 * USDG, 1_000 * USDG + 1));
        vm.prank(address(pm));
        pool.increaseCoverage(landlord, 2_000 * USDG + 2);
    }

    // ───────────── withdrawal queue ─────────────

    function test_GuaranteePool_requestRedeemEscrowsShares() public {
        uint256 shares = _deposit(investor, 2_000 * USDG);
        vm.prank(investor);
        uint256 id = pool.requestRedeem(shares / 2);
        assertEq(id, 0);
        assertEq(pool.balanceOf(investor), shares - shares / 2);
        assertEq(pool.balanceOf(address(pool)), shares / 2);
        assertEq(pool.queuedShares(), shares / 2);
        assertEq(pool.queueLength(), 1);
        GuaranteePool.RedeemRequest memory r = pool.getRedeemRequest(id);
        assertEq(r.owner, investor);
        assertEq(r.shares, shares / 2);
    }

    function test_GuaranteePool_cancelRedeemReturnsShares() public {
        uint256 shares = _deposit(investor, 2_000 * USDG);
        vm.prank(investor);
        uint256 id = pool.requestRedeem(shares);
        vm.expectRevert(NotRequestOwner.selector);
        vm.prank(stranger);
        pool.cancelRedeem(id);
        vm.prank(investor);
        pool.cancelRedeem(id);
        assertEq(pool.balanceOf(investor), shares);
        assertEq(pool.queuedShares(), 0);
        vm.expectRevert(ZeroAmount.selector);
        vm.prank(investor);
        pool.cancelRedeem(id);
    }

    function test_GuaranteePool_processQueueWaitsForLiquidity() public {
        uint256 shares = _deposit(investor, 2_000 * USDG);
        uint256 policyId = _ended(COVER, 12);
        vm.prank(investor);
        pool.requestRedeem(shares);

        assertEq(pool.processQueue(10), 0, "everything above the reserve is not enough for the full request");
        assertEq(pool.queueLength(), 1);

        // The lease closes with no claim → the reserve frees up → the request fills at the current price.
        vm.warp(pm.claimWindowEnd(policyId) + 1);
        pm.closeIfNoClaim(policyId);
        uint256 expected = pool.previewRedeem(shares);
        vm.prank(keeper);
        assertEq(pool.processQueue(10), 1);
        assertEq(usdg.balanceOf(investor), expected);
        assertEq(pool.queueLength(), 0);
        assertEq(pool.queuedShares(), 0);
    }

    function test_GuaranteePool_processQueueIsFifoAndSkipsCancelled() public {
        uint256 a = _deposit(investor, 1_000 * USDG);
        uint256 b = _deposit(stranger, 1_000 * USDG);
        vm.prank(investor);
        uint256 idA = pool.requestRedeem(a);
        vm.prank(stranger);
        pool.requestRedeem(b);
        vm.prank(investor);
        pool.cancelRedeem(idA);
        assertEq(pool.processQueue(10), 1);
        assertApproxEqAbs(usdg.balanceOf(stranger), 1_000 * USDG, 1);
        assertEq(pool.queueHead(), 2);
    }

    function test_GuaranteePool_processQueueBoundedByMaxCount() public {
        uint256 a = _deposit(investor, 1_000 * USDG);
        vm.startPrank(investor);
        pool.requestRedeem(a / 2);
        pool.requestRedeem(a / 2);
        vm.stopPrank();
        assertEq(pool.processQueue(1), 1);
        assertEq(pool.queueLength(), 1);
    }

    // ───────────── roles ─────────────

    function testRevert_GuaranteePool_hooksAreRoleGated() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, pool.POLICY_MANAGER_ROLE()
            )
        );
        vm.prank(stranger);
        pool.increaseCoverage(landlord, 1);

        vm.startPrank(address(pm));
        vm.expectRevert();
        pool.payClaim(landlord, 1);
        vm.expectRevert();
        pool.addPendingClaim(1);
        vm.expectRevert();
        pool.coverDefault(1);
        vm.expectRevert();
        pool.receiveRepayment(1);
        vm.expectRevert();
        pool.receiveRewards(1);
        vm.stopPrank();

        vm.startPrank(address(cm));
        vm.expectRevert();
        pool.decreaseCoverage(landlord, 1);
        vm.expectRevert();
        pool.receivePremium(1, 0);
        vm.stopPrank();
    }

    // ───────────── liquidity and yield ─────────────

    function test_GuaranteePool_payClaimPullsFromAdapter() public {
        _deposit(investor, 5_000 * USDG);
        pool.rebalance(); // 40% idle
        assertApproxEqAbs(pool.idleAssets(), 2_000_400_000, 1);
        vm.prank(address(cm));
        pool.addPendingClaim(3_000 * USDG);
        uint256 before = usdg.balanceOf(landlord);
        vm.prank(address(cm));
        pool.payClaim(landlord, 3_000 * USDG);
        assertEq(usdg.balanceOf(landlord) - before, 3_000 * USDG);
        assertEq(pool.totalClaimsPaid(), 3_000 * USDG);
    }

    function testRevert_GuaranteePool_payClaimInsufficientLiquidity() public {
        vm.prank(address(cm));
        pool.addPendingClaim(5 * USDG);
        vm.expectRevert(abi.encodeWithSelector(InsufficientLiquidity.selector, 1 * USDG, 5 * USDG));
        vm.prank(address(cm));
        pool.payClaim(landlord, 5 * USDG);
    }

    function test_GuaranteePool_rebalanceKeepsTargetAndEarnsYield() public {
        _deposit(investor, 9_999 * USDG); // 10,000 total
        pool.rebalance();
        assertEq(pool.idleAssets(), 4_000 * USDG);
        assertEq(adapter.totalValue(), 6_000 * USDG);
        uint256 before = pool.totalAssets();
        vm.warp(block.timestamp + 365 days);
        assertEq(pool.totalAssets() - before, 204 * USDG, "3.4% on 6,000");
    }

    function test_GuaranteePool_rebalanceKeepsFirstLossAndPendingIdle() public {
        _deposit(investor, 9_999 * USDG);
        vm.prank(address(cm));
        pool.addPendingClaim(1_000 * USDG);
        pool.rebalance();
        // 40% of 9,000 investor assets + 1,000 pending stays idle.
        assertEq(pool.idleAssets(), 4_600 * USDG);
    }

    function test_GuaranteePool_rebalanceTopsUpFromAdapter() public {
        _deposit(investor, 9_999 * USDG);
        pool.rebalance();
        vm.startPrank(address(cm));
        pool.addPendingClaim(3_500 * USDG);
        pool.payClaim(landlord, 3_500 * USDG); // idle 500
        vm.stopPrank();
        pool.rebalance();
        assertEq(pool.idleAssets(), (6_500 * USDG * 4_000) / 10_000);
    }

    function test_GuaranteePool_rebalanceNoAdapterIsNoop() public {
        vm.prank(admin);
        pool.setYieldAdapter(IYieldAdapter(address(0)));
        pool.rebalance();
        assertEq(pool.idleAssets(), 1 * USDG);
    }

    function test_GuaranteePool_setYieldAdapterPullsOldPosition() public {
        _deposit(investor, 9_999 * USDG);
        pool.rebalance();
        MockTBillVault vault2 = new MockTBillVault(usdg, admin);
        TBillAdapter adapter2 = new TBillAdapter(vault2, address(pool));
        vm.prank(admin);
        pool.setYieldAdapter(adapter2);
        assertEq(pool.idleAssets(), 10_000 * USDG);
        assertEq(address(pool.yieldAdapter()), address(adapter2));
    }

    function testRevert_GuaranteePool_setYieldAdapterWrongAsset() public {
        MockUSDG other = new MockUSDG();
        MockTBillVault v = new MockTBillVault(other, admin);
        TBillAdapter a = new TBillAdapter(v, address(pool));
        vm.expectRevert(ParamOutOfBounds.selector);
        vm.prank(admin);
        pool.setYieldAdapter(a);
    }

    function test_GuaranteePool_paramsBoundedAndAdminOnly() public {
        vm.startPrank(admin);
        vm.expectRevert(ParamOutOfBounds.selector);
        pool.setMinReserveBps(2_999);
        vm.expectRevert(ParamOutOfBounds.selector);
        pool.setMinReserveBps(10_001);
        vm.expectRevert(ParamOutOfBounds.selector);
        pool.setLiquidityTargetBps(499);
        vm.expectRevert(ParamOutOfBounds.selector);
        pool.setFirstLossCapBps(2_001);
        vm.expectRevert(ParamOutOfBounds.selector);
        pool.setMaxLandlordShareBps(99);
        vm.expectRevert(ParamOutOfBounds.selector);
        pool.setConcentrationFloor(1_000_001e6);
        pool.setMinReserveBps(6_000);
        pool.setLiquidityTargetBps(3_000);
        pool.setFirstLossCapBps(1_000);
        pool.setMaxLandlordShareBps(2_000);
        vm.stopPrank();
        assertEq(pool.minReserveBps(), 6_000);
        assertEq(pool.liquidityTargetBps(), 3_000);
        assertEq(pool.firstLossCapBps(), 1_000);
        assertEq(pool.maxLandlordShareBps(), 2_000);

        vm.expectRevert();
        vm.prank(stranger);
        pool.setMinReserveBps(5_000);
    }

    function test_GuaranteePool_reserveAndUtilizationViews() public {
        assertEq(pool.reserveRatioBps(), type(uint256).max);
        assertEq(pool.utilizationBps(), 0);
        _deposit(investor, 1_999 * USDG); // 2,000
        _active(COVER, 12);
        assertEq(pool.totalAssets(), 2_011_250_000);
        assertEq(pool.reserveRatioBps(), 10_056);
        assertEq(pool.utilizationBps(), 9_944);
        assertEq(pool.freeAssets(), 1_011_250_000);
    }

    /// @notice Classic donation attack: an attacker front-runs a victim deposit by donating to the pool.
    function test_GuaranteePool_inflationAttackMitigated() public {
        GuaranteePool fresh = new GuaranteePool(usdg, admin);
        address attacker = makeAddr("attacker");
        _mint(attacker, 10_001 * USDG);
        vm.startPrank(attacker);
        usdg.approve(address(fresh), type(uint256).max);
        fresh.deposit(1, attacker);
        usdg.transfer(address(fresh), 10_000 * USDG);
        vm.stopPrank();

        _mint(investor, 1_000 * USDG);
        vm.startPrank(investor);
        usdg.approve(address(fresh), type(uint256).max);
        uint256 shares = fresh.deposit(1_000 * USDG, investor);
        vm.stopPrank();
        assertGt(shares, 0, "victim gets shares");
        assertApproxEqRel(fresh.previewRedeem(shares), 1_000 * USDG, 0.001e18, "victim keeps ~all value");
    }
}
