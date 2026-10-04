// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {Policy, Debt, PolicyStatus, ClaimStatus, RiskTier} from "../../src/libraries/Types.sol";
import "../../src/libraries/Errors.sol";

/// @notice End-to-end flows and the demo script.
contract FlowsTest is BaseTest {
    function setUp() public override {
        super.setUp();
        _deposit(investor, 5_000 * USDG);
    }

    function _status(uint256 id) internal view returns (PolicyStatus) {
        return pm.getPolicy(id).status;
    }

    /// No claim → clean record → tier A next time.
    function test_Flow_noClaimThenTierA() public {
        uint256 id = _invite(COVER, 12);
        vm.prank(tenant);
        pm.acceptInvite(id);
        for (uint256 i = 1; i < 12; i++) {
            vm.warp(block.timestamp + 1 minutes);
            vm.prank(tenant);
            pm.payPremium(id);
        }
        vm.warp(pm.getPolicy(id).endTime);
        pm.endLease(id);
        vm.warp(pm.claimWindowEnd(id) + 1);
        pm.closeIfNoClaim(id);

        assertEq(uint8(_status(id)), uint8(PolicyStatus.Closed));
        assertEq(pool.activeCoverage(), 0);
        assertEq(pm.totalPremiumsCollected(), 180e6);
        assertEq(pool.totalPremiumsReceived(), 135e6);
        assertEq(pool.firstLossBalance(), 18e6);
        assertEq(usdg.balanceOf(treasury), 27e6);

        uint256 next = _active(COVER, 12);
        assertEq(uint8(pm.getPolicy(next).tier), uint8(RiskTier.A));
        assertEq(pm.getPolicy(next).monthlyPremium, 12e6, "20% off for a clean history");
    }

    function test_Flow_claimAccepted() public {
        uint256 id = _ended(COVER, 12);
        uint256 claimId = _fileClaim(id, 300e6);
        vm.prank(tenant);
        cm.acceptClaim(claimId);
        assertEq(uint8(cm.getClaim(claimId).status), uint8(ClaimStatus.Paid));
        assertEq(cm.getDebt(claimId).principal, 300e6);
        assertEq(uint8(_status(id)), uint8(PolicyStatus.Closed));
    }

    function test_Flow_silenceAutoAccepts() public {
        uint256 id = _ended(COVER, 12);
        uint256 claimId = _fileClaim(id, 450e6);
        vm.warp(cm.getClaim(claimId).responseDeadline + 1);
        vm.prank(keeper);
        cm.autoAcceptClaim(claimId);
        assertEq(cm.getClaim(claimId).amountApproved, 450e6);
        assertEq(cm.getDebt(claimId).principal, 450e6);
    }

    function test_Flow_disputeFullApprovalAddsFee() public {
        (uint256 id, uint256 claimId) = _disputed(300e6);
        vm.prank(arbiter);
        cm.resolveDispute(claimId, 300e6, "New damage confirmed");
        assertEq(cm.getDebt(claimId).principal, 310e6);
        assertEq(uint8(_status(id)), uint8(PolicyStatus.Closed));
    }

    function test_Flow_disputePartial() public {
        (, uint256 claimId) = _disputed(300e6);
        vm.prank(arbiter);
        cm.resolveDispute(claimId, 200e6, "Partly pre-existing");
        assertEq(cm.getClaim(claimId).amountApproved, 200e6);
        assertEq(cm.getDebt(claimId).principal, 200e6, "no fee on a partial decision");
    }

    function test_Flow_disputeRejected() public {
        uint256 landlordBefore = usdg.balanceOf(landlord);
        (uint256 id, uint256 claimId) = _disputed(300e6);
        vm.prank(arbiter);
        cm.resolveDispute(claimId, 0, "Normal wear and tear");
        assertEq(uint8(cm.getClaim(claimId).status), uint8(ClaimStatus.Rejected));
        assertEq(usdg.balanceOf(landlord), landlordBefore);
        assertEq(cm.getDebt(claimId).principal, 0);
        assertEq(uint8(_status(id)), uint8(PolicyStatus.Closed));
    }

    function test_Flow_lapseThenClaimIncludesMissedPremium() public {
        uint256 id = _lapsed(COVER, 12);
        assertEq(pool.activeCoverage(), COVER, "still covered after a lapse");
        uint256 claimId = _fileClaim(id, 400e6);
        vm.warp(cm.getClaim(claimId).responseDeadline + 1);
        cm.autoAcceptClaim(claimId);
        assertEq(cm.getDebt(claimId).principal, 415e6, "claim + one missed 15.00 premium");
        assertEq(pool.activeCoverage(), 0);
    }

    function test_Flow_repaymentInFull() public {
        uint256 id = _ended(COVER, 12);
        uint256 claimId = _fileClaim(id, 300e6);
        vm.prank(tenant);
        cm.acceptClaim(claimId);
        for (uint256 i = 0; i < 6; i++) {
            vm.warp(block.timestamp + t.installmentPeriod);
            vm.prank(tenant);
            cm.repay(claimId, 50e6);
        }
        Debt memory d = cm.getDebt(claimId);
        assertEq(d.repaid, 300e6);
        assertFalse(d.defaulted);
        assertEq(pool.totalRecoveries(), 300e6);
        assertFalse(registry.isBlocked(tenant));
    }

    function test_Flow_defaultCoveredByFirstLossAndTenantBlocked() public {
        uint256 id = _ended(COVER, 12); // first-loss 18
        uint256 claimId = _fileClaim(id, 300e6);
        vm.prank(tenant);
        cm.acceptClaim(claimId);
        vm.prank(tenant);
        cm.repay(claimId, 50e6);
        uint256 assetsBefore = pool.totalAssets();
        vm.warp(cm.getDebt(claimId).nextInstallmentDue + t.gracePeriod + 1);
        cm.markDefault(claimId);

        assertTrue(cm.getDebt(claimId).defaulted);
        assertEq(pool.totalAssets() - assetsBefore, 18e6);
        assertEq(pool.firstLossBalance(), 0);

        uint256 next = _invite(COVER, 12);
        vm.expectRevert(TenantBlocked.selector);
        vm.prank(tenant);
        pm.acceptInvite(next);
    }

    function test_Flow_concentrationCap() public {
        vm.prank(admin);
        pool.setConcentrationFloor(3_000e6);
        _active(COVER, 12);
        vm.expectRevert(abi.encodeWithSelector(ConcentrationTooHigh.selector, 4_000e6, 3_000e6));
        _invite(COVER, 12);

        // Another landlord still has room.
        address other = makeAddr("otherLandlord");
        vm.prank(other);
        uint256 id = pm.createInvite(address(0), "Kos Tebet No. 7", 0, COVER, 12, "", CHECK_IN);
        address tenant2 = makeAddr("tenant2");
        _mint(tenant2, 1_000e6);
        _approveAll(tenant2);
        vm.prank(tenant2);
        pm.acceptInvite(id);
        assertEq(pool.coverageByLandlord(other), COVER);
    }

    function test_Flow_reserveCapOnActivationAndWithdraw() public {
        // Activation: 5,001 assets back at most 10,002 coverage.
        _active(10_000e6, 12);
        vm.expectRevert();
        _invite(COVER, 12);

        // Withdrawal: anything that would break 50% of 10,000 coverage is refused.
        uint256 free = pool.freeAssets();
        assertEq(pool.maxWithdraw(investor), free);
        vm.expectRevert();
        vm.prank(investor);
        pool.withdraw(free + 1, investor, investor);
        vm.prank(investor);
        pool.withdraw(free, investor, investor);
        assertEq(pool.totalAssets(), pool.requiredReserve(pool.activeCoverage()));
    }

    function test_Flow_withdrawalQueue() public {
        address investor2 = makeAddr("investor2");
        uint256 shares2 = _deposit(investor2, 1_000 * USDG);
        uint256 id = _ended(8_000e6, 12); // reserve 4,000 of ~6,300 investor assets
        uint256 shares1 = pool.balanceOf(investor);

        vm.prank(investor);
        pool.requestRedeem(shares1);
        vm.prank(investor2);
        uint256 req2 = pool.requestRedeem(shares2);

        // First request too big: nothing paid, FIFO holds.
        assertEq(pool.processQueue(10), 0);

        // investor2 changes their mind.
        vm.prank(investor2);
        pool.cancelRedeem(req2);
        assertEq(pool.balanceOf(investor2), shares2);

        // Lease closes → reserve frees → request paid.
        vm.warp(pm.claimWindowEnd(id) + 1);
        pm.closeIfNoClaim(id);
        uint256 expected = pool.previewRedeem(shares1);
        assertEq(pool.processQueue(10), 1);
        assertEq(usdg.balanceOf(investor), expected);
        assertGt(expected, 5_000 * USDG, "escrowed shares kept earning premiums");
    }

    function test_Flow_pendingClaimLowersPriceAndRejectionRestores() public {
        uint256 id = _ended(COVER, 12);
        uint256 price = _sharePrice();
        uint256 claimId = _fileClaim(id, 1_000e6);
        assertLt(_sharePrice(), price, "withdrawing now can't escape the loss");
        vm.prank(tenant);
        cm.disputeClaim(claimId, "Photos show no new damage");
        vm.prank(arbiter);
        cm.resolveDispute(claimId, 0, "No new damage");
        assertEq(_sharePrice(), price);
    }

    function test_Flow_rebalanceAndAdapterPullOnClaim() public {
        uint256 id = _ended(COVER, 12);
        pool.rebalance();
        uint256 idle = pool.idleAssets();
        assertGt(adapter.totalValue(), 0);
        uint256 claimId = _fileClaim(id, COVER);
        pool.rebalance(); // the pending claim is kept liquid
        assertGt(pool.idleAssets(), idle);
        vm.prank(tenant);
        cm.acceptClaim(claimId);
        assertEq(pool.totalClaimsPaid(), COVER);
    }

    function test_Flow_gdnRewardsRaisePrice() public {
        uint256 price = _sharePrice();
        vm.warp(block.timestamp + 30 days);
        gdn.distributeRewards();
        assertGt(_sharePrice(), price);
    }

    /// Demo script, step by step.
    function test_Flow_demoScript() public {
        // 1. Investor deposited 5,000 in setUp. Seed deposit 1 → 5,001.
        assertEq(pool.totalAssets(), 5_001e6);

        // 2. Landlord: "Unit 12B, Orchard", rent 2,000, coverage 2,000, 12 months.
        uint256 id = _invite(COVER, 12);

        // 3. New tenant (tier B) pays the first 15 → pool +11.25, first-loss +1.50, treasury +2.25.
        vm.prank(tenant);
        pm.acceptInvite(id);
        assertEq(pool.totalAssets(), 5_012_250_000);
        assertEq(pool.firstLossBalance(), 1_500_000);
        assertEq(usdg.balanceOf(treasury), 2_250_000);

        // 4. A month later the tenant pays again; GDN rewards push the price up.
        vm.warp(block.timestamp + 1 minutes);
        vm.prank(tenant);
        pm.payPremium(id);
        uint256 price = _sharePrice();
        vm.prank(admin);
        gdn.setTimeMultiplier(43_200); // demo profile: 1 minute = 1 month
        vm.warp(block.timestamp + 1 minutes);
        gdn.distributeRewards();
        assertGt(_sharePrice(), price);

        // 5. Lease end → landlord files a 300 claim → pending claims lower the price.
        _payAll(id);
        vm.warp(pm.getPolicy(id).endTime);
        pm.endLease(id);
        price = _sharePrice();
        uint256 claimId = _fileClaim(id, 300e6);
        assertLt(_sharePrice(), price);

        // 6. Dispute → arbiter approves 200 → tenant owes 200.
        vm.prank(tenant);
        cm.disputeClaim(claimId, "Wardrobe was already damaged");
        uint256 landlordBefore = usdg.balanceOf(landlord);
        vm.prank(arbiter);
        cm.resolveDispute(claimId, 200e6, "Wall damage is new; wardrobe pre-existing");
        assertEq(usdg.balanceOf(landlord) - landlordBefore, 200e6);
        assertEq(cm.getDebt(claimId).principal, 200e6);
        assertEq(cm.installmentAmount(claimId), 33_333_334);

        // 7. Tenant repays 70 → pool assets +70.
        uint256 assetsBefore = pool.totalAssets();
        vm.prank(tenant);
        cm.repay(claimId, 70e6);
        assertEq(pool.totalAssets() - assetsBefore, 70e6);

        // 8. Defaults: see the default flow.
        assertEq(pool.totalClaimsPaid(), 200e6);
        assertEq(pool.totalRecoveries(), 70e6);
    }
}
