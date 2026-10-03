// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {ClaimManager} from "../../src/ClaimManager.sol";
import {Claim, Debt, PolicyStatus, ClaimStatus, ClaimType} from "../../src/libraries/Types.sol";
import {TenantRegistry} from "../../src/TenantRegistry.sol";
import "../../src/libraries/Errors.sol";

contract ClaimManagerTest is BaseTest {
    uint256 policyId;

    function setUp() public override {
        super.setUp();
        _deposit(investor, 5_000 * USDG);
        policyId = _ended(COVER, 12);
    }

    function _disputedHere(uint128 amount) internal returns (uint256 claimId) {
        claimId = _fileClaim(policyId, amount);
        vm.prank(tenant);
        cm.disputeClaim(claimId, "Wardrobe was already damaged at check-in");
    }

    function _accepted(uint128 amount) internal returns (uint256 claimId) {
        claimId = _fileClaim(policyId, amount);
        vm.prank(tenant);
        cm.acceptClaim(claimId);
    }

    // ───────────── fileClaim ─────────────

    function test_ClaimManager_fileOpensResponseWindowAndLowersPrice() public {
        uint256 assetsBefore = pool.totalAssets();
        vm.expectEmit(true, true, false, true);
        emit ClaimManager.ClaimFiled(
            1, policyId, ClaimType.Damage, 300e6, CHECK_OUT_CID, CHECK_OUT, uint64(block.timestamp) + t.responseWindow
        );
        uint256 claimId = _fileClaim(policyId, 300e6);

        Claim memory c = cm.getClaim(claimId);
        assertEq(c.policyId, policyId);
        assertEq(uint8(c.claimType), uint8(ClaimType.Damage));
        assertEq(c.amountClaimed, 300e6);
        assertEq(c.responseDeadline, block.timestamp + t.responseWindow);
        assertEq(c.evidenceCid, CHECK_OUT_CID);
        assertEq(c.evidenceHash, CHECK_OUT);
        assertEq(uint8(c.status), uint8(ClaimStatus.Filed));
        assertEq(uint8(pm.getPolicy(policyId).status), uint8(PolicyStatus.Claimed));
        assertEq(cm.claimIdByPolicy(policyId), claimId);
        assertEq(pool.pendingClaimsLiability(), 300e6);
        assertEq(assetsBefore - pool.totalAssets(), 300e6, "pending claim counts against investors at once");
    }

    function testRevert_ClaimManager_fileOnlyLandlord() public {
        vm.expectRevert(NotLandlord.selector);
        vm.prank(tenant);
        cm.fileClaim(policyId, ClaimType.Damage, 300e6, "", CHECK_OUT, "x");
    }

    function testRevert_ClaimManager_fileAmountBounds() public {
        vm.startPrank(landlord);
        vm.expectRevert(ZeroAmount.selector);
        cm.fileClaim(policyId, ClaimType.Damage, 0, "", CHECK_OUT, "x");
        vm.expectRevert(AmountExceedsCoverage.selector);
        cm.fileClaim(policyId, ClaimType.Damage, COVER + 1, "", CHECK_OUT, "x");
        vm.stopPrank();
    }

    function testRevert_ClaimManager_fileStringsTooLong() public {
        vm.startPrank(landlord);
        vm.expectRevert(StringTooLong.selector);
        cm.fileClaim(policyId, ClaimType.Damage, 300e6, "", CHECK_OUT, string(new bytes(281)));
        vm.expectRevert(StringTooLong.selector);
        cm.fileClaim(policyId, ClaimType.Damage, 300e6, string(new bytes(101)), CHECK_OUT, "x");
        vm.stopPrank();
    }

    function testRevert_ClaimManager_fileAfterWindow() public {
        vm.warp(pm.claimWindowEnd(policyId) + 1);
        vm.expectRevert(WindowClosed.selector);
        _fileClaim(policyId, 300e6);
    }

    function test_ClaimManager_fileAtWindowEdge() public {
        vm.warp(pm.claimWindowEnd(policyId));
        _fileClaim(policyId, 300e6);
    }

    function testRevert_ClaimManager_fileBeforeLeaseEnd() public {
        uint256 active = _active(COVER, 12);
        vm.expectRevert(abi.encodeWithSelector(InvalidStatus.selector, 3, 1));
        _fileClaim(active, 300e6);
    }

    function test_ClaimManager_fileAutoEndsFullyPaidLease() public {
        uint256 active = _active(COVER, 12);
        _payAll(active);
        vm.warp(pm.getPolicy(active).endTime);
        _fileClaim(active, 100e6);
        assertEq(uint8(pm.getPolicy(active).status), uint8(PolicyStatus.Claimed));
    }

    function testRevert_ClaimManager_fileSecondClaim() public {
        _fileClaim(policyId, 300e6);
        vm.expectRevert(ClaimExists.selector);
        _fileClaim(policyId, 100e6);
    }

    function test_ClaimManager_fileOnLapsedPolicyWithinWindow() public {
        uint256 lapsed = _lapsed(COVER, 12);
        vm.prank(landlord);
        uint256 claimId = cm.fileClaim(lapsed, ClaimType.UnpaidRent, 500e6, "", CHECK_OUT, "Two months unpaid");
        assertEq(uint8(cm.getClaim(claimId).claimType), uint8(ClaimType.UnpaidRent));
        assertEq(uint8(pm.getPolicy(lapsed).status), uint8(PolicyStatus.Claimed));
    }

    function testRevert_ClaimManager_fileOnLapsedPolicyAfterWindow() public {
        uint256 lapsed = _lapsed(COVER, 12);
        vm.warp(pm.claimWindowEnd(lapsed) + 1);
        vm.expectRevert(WindowClosed.selector);
        _fileClaim(lapsed, 100e6);
    }

    // ───────────── tenant response ─────────────

    function test_ClaimManager_acceptPaysLandlordAndCreatesDebt() public {
        uint256 claimId = _fileClaim(policyId, 300e6);
        uint256 landlordBefore = usdg.balanceOf(landlord);
        uint256 assetsBefore = pool.totalAssets();

        vm.prank(tenant);
        cm.acceptClaim(claimId);

        Claim memory c = cm.getClaim(claimId);
        assertEq(uint8(c.status), uint8(ClaimStatus.Paid));
        assertEq(c.amountApproved, 300e6);
        assertEq(usdg.balanceOf(landlord) - landlordBefore, 300e6, "paid instantly");
        assertEq(pool.totalAssets(), assetsBefore, "loss was already priced in when filed");
        assertEq(pool.pendingClaimsLiability(), 0);

        Debt memory d = cm.getDebt(claimId);
        assertEq(d.principal, 300e6, "no dispute fee");
        assertEq(d.installments, 6);
        assertEq(d.nextInstallmentDue, block.timestamp + t.installmentPeriod);

        assertEq(uint8(pm.getPolicy(policyId).status), uint8(PolicyStatus.Closed));
        assertEq(pool.activeCoverage(), 0);
        TenantRegistry.Record memory r = registry.recordOf(tenant);
        assertEq(r.claimsPaid, 1);
        assertEq(r.openDebts, 1);
        assertTrue(registry.isBlocked(tenant), "open debt blocks new guarantees");
    }

    function testRevert_ClaimManager_acceptOnlyTenant() public {
        uint256 claimId = _fileClaim(policyId, 300e6);
        vm.expectRevert(NotTenant.selector);
        vm.prank(landlord);
        cm.acceptClaim(claimId);
    }

    function testRevert_ClaimManager_acceptAfterDeadline() public {
        uint256 claimId = _fileClaim(policyId, 300e6);
        vm.warp(cm.getClaim(claimId).responseDeadline + 1);
        vm.expectRevert(WindowClosed.selector);
        vm.prank(tenant);
        cm.acceptClaim(claimId);
    }

    function testRevert_ClaimManager_disputeRequiresNote() public {
        uint256 claimId = _fileClaim(policyId, 300e6);
        vm.expectRevert(ReasonRequired.selector);
        vm.prank(tenant);
        cm.disputeClaim(claimId, "");
    }

    function testRevert_ClaimManager_disputeOnlyTenantBeforeDeadline() public {
        uint256 claimId = _fileClaim(policyId, 300e6);
        vm.expectRevert(NotTenant.selector);
        vm.prank(stranger);
        cm.disputeClaim(claimId, "no");
        vm.warp(cm.getClaim(claimId).responseDeadline + 1);
        vm.expectRevert(WindowClosed.selector);
        vm.prank(tenant);
        cm.disputeClaim(claimId, "no");
    }

    function test_ClaimManager_disputeSetsArbiterDeadline() public {
        uint256 claimId = _disputedHere(300e6);
        Claim memory c = cm.getClaim(claimId);
        assertEq(uint8(c.status), uint8(ClaimStatus.Disputed));
        assertEq(c.tenantNote, "Wardrobe was already damaged at check-in");
        assertEq(c.arbiterDeadline, block.timestamp + t.arbiterWindow);
    }

    // ───────────── silence rule ─────────────

    function testRevert_ClaimManager_autoAcceptBeforeDeadline() public {
        uint256 claimId = _fileClaim(policyId, 300e6);
        vm.warp(cm.getClaim(claimId).responseDeadline);
        vm.expectRevert(WindowNotOpen.selector);
        cm.autoAcceptClaim(claimId);
    }

    function test_ClaimManager_autoAcceptAfterDeadline() public {
        uint256 claimId = _fileClaim(policyId, 300e6);
        vm.warp(cm.getClaim(claimId).responseDeadline + 1);
        vm.expectEmit(true, false, false, true);
        emit ClaimManager.ClaimAccepted(claimId, true);
        vm.prank(keeper);
        cm.autoAcceptClaim(claimId);
        assertEq(uint8(cm.getClaim(claimId).status), uint8(ClaimStatus.Paid));
        assertEq(cm.getDebt(claimId).principal, 300e6);
    }

    // ───────────── arbiter ─────────────

    function test_ClaimManager_fullApprovalAddsDisputeFee() public {
        uint256 claimId = _disputedHere(300e6);
        vm.prank(arbiter);
        cm.resolveDispute(claimId, 300e6, "Check-out photos show new damage");
        Claim memory c = cm.getClaim(claimId);
        assertEq(uint8(c.status), uint8(ClaimStatus.Paid));
        assertEq(c.amountApproved, 300e6);
        assertEq(c.arbiterReason, "Check-out photos show new damage");
        assertEq(cm.getDebt(claimId).principal, 310e6, "minimum fee 10");
        assertEq(cm.disputeFeeOf(claimId), 10e6);
    }

    function test_ClaimManager_partialApprovalHasNoFee() public {
        uint256 claimId = _disputedHere(300e6);
        uint256 before = usdg.balanceOf(landlord);
        vm.expectEmit(true, false, false, true);
        emit ClaimManager.ClaimResolved(claimId, ClaimStatus.PartiallyApproved, 200e6, 0);
        vm.prank(arbiter);
        cm.resolveDispute(claimId, 200e6, "Wardrobe pre-existing; wall damage is new");
        assertEq(usdg.balanceOf(landlord) - before, 200e6);
        assertEq(cm.getDebt(claimId).principal, 200e6);
        assertEq(pool.pendingClaimsLiability(), 0);
    }

    function test_ClaimManager_percentFeeAboveMinimum() public {
        uint256 claimId = _disputedHere(1_500e6);
        vm.prank(arbiter);
        cm.resolveDispute(claimId, 1_500e6, "Full");
        assertEq(cm.getDebt(claimId).principal, 1_530e6, "2% of 1,500");
    }

    function test_ClaimManager_rejectRestoresPriceAndRecordsClean() public {
        uint256 assetsBefore = pool.totalAssets();
        uint256 claimId = _disputedHere(300e6);
        assertEq(assetsBefore - pool.totalAssets(), 300e6);
        vm.prank(arbiter);
        cm.resolveDispute(claimId, 0, "No evidence of new damage");
        assertEq(uint8(cm.getClaim(claimId).status), uint8(ClaimStatus.Rejected));
        assertEq(pool.totalAssets(), assetsBefore, "rejection restores the share price");
        assertEq(cm.getDebt(claimId).principal, 0);
        assertEq(uint8(pm.getPolicy(policyId).status), uint8(PolicyStatus.Closed));
        assertEq(pool.activeCoverage(), 0);
        assertEq(registry.recordOf(tenant).cleanCompleted, 1);
    }

    function testRevert_ClaimManager_resolveGuards() public {
        uint256 claimId = _disputedHere(300e6);
        vm.expectRevert();
        vm.prank(stranger);
        cm.resolveDispute(claimId, 100e6, "x");

        vm.startPrank(arbiter);
        vm.expectRevert(AmountExceedsClaim.selector);
        cm.resolveDispute(claimId, 300e6 + 1, "x");
        vm.expectRevert(ReasonRequired.selector);
        cm.resolveDispute(claimId, 100e6, "");
        vm.stopPrank();
    }

    function testRevert_ClaimManager_resolveNotDisputed() public {
        uint256 claimId = _fileClaim(policyId, 300e6);
        vm.expectRevert(abi.encodeWithSelector(InvalidStatus.selector, 3, 1));
        vm.prank(arbiter);
        cm.resolveDispute(claimId, 100e6, "x");
    }

    function test_ClaimManager_reassignArbiter() public {
        uint256 claimId = _disputedHere(300e6);
        address arbiter2 = makeAddr("arbiter2");
        vm.startPrank(admin);
        cm.grantRole(cm.ARBITER_ROLE(), arbiter2);
        vm.expectRevert(WindowNotOpen.selector);
        cm.reassignArbiter(claimId, arbiter2);

        vm.warp(cm.getClaim(claimId).arbiterDeadline + 1);
        vm.expectRevert(NotAssignedArbiter.selector);
        cm.reassignArbiter(claimId, stranger);
        cm.reassignArbiter(claimId, arbiter2);
        vm.stopPrank();

        vm.expectRevert(NotAssignedArbiter.selector);
        vm.prank(arbiter);
        cm.resolveDispute(claimId, 100e6, "late");

        vm.prank(arbiter2);
        cm.resolveDispute(claimId, 100e6, "Decided by backup arbiter");
        assertEq(cm.getClaim(claimId).amountApproved, 100e6);
    }

    // ───────────── debt ─────────────

    function test_ClaimManager_repayPoolFirstThenTreasury() public {
        uint256 claimId = _disputedHere(300e6);
        vm.prank(arbiter);
        cm.resolveDispute(claimId, 300e6, "Full");

        uint256 assetsBefore = pool.totalAssets();
        uint256 treasuryBefore = usdg.balanceOf(treasury);
        vm.prank(tenant);
        cm.repay(claimId, 70e6);
        assertEq(pool.totalAssets() - assetsBefore, 70e6, "pool +70");
        assertEq(pool.totalRecoveries(), 70e6);

        vm.prank(tenant);
        cm.repay(claimId, 235e6); // 230 to the pool, 5 to the treasury
        assertEq(pool.totalAssets() - assetsBefore, 300e6);
        assertEq(usdg.balanceOf(treasury) - treasuryBefore, 5e6);
        assertEq(cm.getDebt(claimId).repaid, 305e6);
    }

    function test_ClaimManager_repayInFullUnblocksTenantAtTierC() public {
        uint256 claimId = _accepted(300e6);
        uint256 tenantBefore = usdg.balanceOf(tenant);
        vm.prank(tenant);
        cm.repay(claimId, 1_000e6);
        assertEq(tenantBefore - usdg.balanceOf(tenant), 300e6, "overpayment capped");
        Debt memory d = cm.getDebt(claimId);
        assertEq(d.repaid, d.principal);
        assertEq(d.nextInstallmentDue, 0);
        assertFalse(registry.isBlocked(tenant));
        assertEq(uint8(registry.tierOf(tenant)), 2, "a paid claim prices the next lease at tier C");

        vm.expectRevert(NothingOwed.selector);
        vm.prank(tenant);
        cm.repay(claimId, 1);
    }

    function testRevert_ClaimManager_repayZero() public {
        vm.expectRevert(ZeroAmount.selector);
        cm.repay(1, 0);
    }

    function test_ClaimManager_repayByAnyone() public {
        uint256 claimId = _accepted(300e6);
        _mint(stranger, 100e6);
        _approveAll(stranger);
        vm.prank(stranger);
        cm.repay(claimId, 100e6);
        assertEq(cm.getDebt(claimId).repaid, 100e6);
    }

    function test_ClaimManager_installmentScheduleAdvances() public {
        uint256 claimId = _accepted(300e6);
        uint64 start = cm.debtStart(claimId);
        assertEq(cm.installmentAmount(claimId), 50e6, "6 installments");

        vm.prank(tenant);
        cm.repay(claimId, 50e6);
        assertEq(cm.getDebt(claimId).nextInstallmentDue, start + 2 * t.installmentPeriod);
        vm.prank(tenant);
        cm.repay(claimId, 25e6);
        assertEq(cm.getDebt(claimId).nextInstallmentDue, start + 2 * t.installmentPeriod, "partial installment");
    }

    function test_ClaimManager_lapsedClaimAddsMissedPremium() public {
        uint256 lapsed = _lapsed(COVER, 12);
        uint256 claimId = _fileClaim(lapsed, 300e6);
        vm.expectEmit(true, true, false, true);
        emit ClaimManager.DebtCreated(claimId, tenant, 315e6, 15e6, 6);
        vm.prank(tenant);
        cm.acceptClaim(claimId);
        assertEq(cm.getDebt(claimId).principal, 315e6);
        assertEq(registry.recordOf(tenant).cleanCompleted, 0);
    }

    function test_ClaimManager_markDefaultUsesFirstLossAndBlocks() public {
        uint256 claimId = _accepted(300e6);
        Debt memory d = cm.getDebt(claimId);
        uint256 firstLoss = pool.firstLossBalance();
        assertEq(firstLoss, 18e6, "12 premiums x 1.50");
        uint256 assetsBefore = pool.totalAssets();

        vm.warp(d.nextInstallmentDue + t.gracePeriod);
        vm.expectRevert(NotOverdue.selector);
        cm.markDefault(claimId);

        vm.warp(d.nextInstallmentDue + t.gracePeriod + 1);
        vm.expectEmit(true, false, false, true);
        emit ClaimManager.DefaultCovered(policyId, 18e6, 282e6);
        vm.prank(keeper);
        cm.markDefault(claimId);

        assertTrue(cm.getDebt(claimId).defaulted);
        assertEq(pool.firstLossBalance(), 0);
        assertEq(pool.totalAssets() - assetsBefore, 18e6, "first-loss pays investors back first");
        assertTrue(registry.recordOf(tenant).defaulted);
        assertTrue(registry.isBlocked(tenant));

        vm.expectRevert(AlreadyDefaulted.selector);
        cm.markDefault(claimId);
    }

    function testRevert_ClaimManager_markDefaultNoDebt() public {
        vm.expectRevert(NothingOwed.selector);
        cm.markDefault(42);
    }

    // ───────────── admin ─────────────

    function test_ClaimManager_disputeFeeParams() public {
        vm.startPrank(admin);
        vm.expectRevert(ParamOutOfBounds.selector);
        cm.setDisputeFeeBps(1_001);
        vm.expectRevert(ParamOutOfBounds.selector);
        cm.setMinDisputeFee(101e6);
        cm.setDisputeFeeBps(500);
        cm.setMinDisputeFee(0);
        vm.stopPrank();
        assertEq(cm.disputeFee(300e6), 15e6);

        vm.expectRevert();
        vm.prank(stranger);
        cm.setDisputeFeeBps(100);
    }

    function test_ClaimManager_disputeFeeView() public view {
        assertEq(cm.disputeFee(300e6), 10e6, "minimum");
        assertEq(cm.disputeFee(1_000e6), 20e6, "2%");
    }
}
