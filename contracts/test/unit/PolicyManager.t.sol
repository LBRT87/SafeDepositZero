// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {PolicyManager} from "../../src/PolicyManager.sol";
import {PremiumCalculatorSol} from "../../src/PremiumCalculatorSol.sol";
import {IPremiumCalculator} from "../../src/interfaces/IPremiumCalculator.sol";
import {Policy, PolicyStatus, RiskTier, TimeConfig, TimeProfiles} from "../../src/libraries/Types.sol";
import "../../src/libraries/Errors.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract PolicyManagerTest is BaseTest {
    function setUp() public override {
        super.setUp();
        _deposit(investor, 5_000 * USDG);
    }

    // ───────────── createInvite ─────────────

    function test_PolicyManager_createInviteStoresPolicy() public {
        vm.expectEmit(true, true, true, true);
        emit PolicyManager.InviteCreated(
            1, landlord, address(0), "Unit 12B, Orchard", 2_000e6, COVER, 12, CHECK_IN_CID, CHECK_IN
        );
        uint256 id = _invite(COVER, 12);

        Policy memory p = pm.getPolicy(id);
        assertEq(id, 1);
        assertEq(p.landlord, landlord);
        assertEq(p.tenant, address(0));
        assertEq(p.coverage, COVER);
        assertEq(p.monthlyPremium, 0, "priced at accept");
        assertEq(p.totalPeriods, 12);
        assertEq(p.checkInCid, CHECK_IN_CID);
        assertEq(p.checkInHash, CHECK_IN);
        assertEq(uint8(p.status), uint8(PolicyStatus.Invited));
        assertEq(pool.activeCoverage(), 0, "invites don't count toward coverage");
    }

    function testRevert_PolicyManager_createInviteZeroCoverage() public {
        vm.expectRevert(ZeroAmount.selector);
        vm.prank(landlord);
        pm.createInvite(address(0), "Unit 1", 0, 0, 12, "", CHECK_IN);
    }

    function testRevert_PolicyManager_createInviteCoverageTooHigh() public {
        vm.expectRevert(CoverageTooHigh.selector);
        vm.prank(landlord);
        pm.createInvite(address(0), "Unit 1", 0, 10_000e6 + 1, 12, "", CHECK_IN);
    }

    function testRevert_PolicyManager_createInviteTermNot6Or12() public {
        vm.startPrank(landlord);
        vm.expectRevert(InvalidTerm.selector);
        pm.createInvite(address(0), "Unit 1", 0, COVER, 5, "", CHECK_IN);
        vm.expectRevert(InvalidTerm.selector);
        pm.createInvite(address(0), "Unit 1", 0, COVER, 24, "", CHECK_IN);
        vm.stopPrank();
    }

    function testRevert_PolicyManager_createInviteBadStrings() public {
        vm.startPrank(landlord);
        vm.expectRevert(StringTooLong.selector);
        pm.createInvite(address(0), "", 0, COVER, 12, "", CHECK_IN);
        vm.expectRevert(StringTooLong.selector);
        pm.createInvite(address(0), string(new bytes(65)), 0, COVER, 12, "", CHECK_IN);
        vm.expectRevert(StringTooLong.selector);
        pm.createInvite(address(0), "Unit 1", 0, COVER, 12, string(new bytes(101)), CHECK_IN);
        vm.stopPrank();
    }

    function testRevert_PolicyManager_createInviteTenantIsLandlord() public {
        vm.expectRevert(SameParty.selector);
        vm.prank(landlord);
        pm.createInvite(landlord, "Unit 1", 0, COVER, 12, "", CHECK_IN);
    }

    function testRevert_PolicyManager_createInviteWhenPaused() public {
        vm.prank(admin);
        pm.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        _invite(COVER, 12);
    }

    function testRevert_PolicyManager_createInviteReserveTooLow() public {
        _active(6_000e6, 12); // pool: 5,001 + 33.75 premium share
        vm.expectRevert(abi.encodeWithSelector(ReserveTooLow.selector, 5_034_750_000, 6_000e6));
        vm.prank(landlord);
        pm.createInvite(address(0), "Unit 1", 0, 6_000e6, 12, "", CHECK_IN);
    }

    function testRevert_PolicyManager_createInviteConcentrationTooHigh() public {
        vm.prank(admin);
        pool.setConcentrationFloor(0);
        // capacity = 5,001 / 50% = 10,002 → landlord limit 10% = 1,000.2
        vm.expectRevert(abi.encodeWithSelector(ConcentrationTooHigh.selector, COVER, 1_000_200_000));
        _invite(COVER, 12);
    }

    function test_PolicyManager_cancelInvite() public {
        uint256 id = _invite(COVER, 12);
        vm.expectRevert(NotLandlord.selector);
        vm.prank(stranger);
        pm.cancelInvite(id);

        vm.prank(landlord);
        pm.cancelInvite(id);
        assertEq(uint8(pm.getPolicy(id).status), uint8(PolicyStatus.Cancelled));

        vm.expectRevert(abi.encodeWithSelector(InvalidStatus.selector, 0, 6));
        vm.prank(tenant);
        pm.acceptInvite(id);
    }

    // ───────────── acceptInvite ─────────────

    function test_PolicyManager_acceptActivatesAndSplitsPremium() public {
        uint256 id = _invite(COVER, 12);
        uint256 assetsBefore = pool.totalAssets();

        vm.expectEmit(true, false, false, true);
        emit PolicyManager.PremiumPaid(id, 15e6, 11_250_000, 1_500_000, 2_250_000, 1);
        vm.prank(tenant);
        pm.acceptInvite(id);

        Policy memory p = pm.getPolicy(id);
        assertEq(uint8(p.status), uint8(PolicyStatus.Active));
        assertEq(p.tenant, tenant);
        assertEq(uint8(p.tier), uint8(RiskTier.B), "new renter");
        assertEq(p.monthlyPremium, 15e6);
        assertEq(p.startTime, block.timestamp);
        assertEq(p.endTime, block.timestamp + 12 minutes);
        assertEq(p.nextPremiumDue, block.timestamp + 1 minutes);
        assertEq(p.periodsPaid, 1);
        assertEq(pool.totalAssets() - assetsBefore, 11_250_000, "investors +11.25");
        assertEq(pool.firstLossBalance(), 1_500_000, "first-loss +1.50");
        assertEq(usdg.balanceOf(treasury), 2_250_000, "treasury +2.25");
        assertEq(pool.activeCoverage(), COVER);
        assertEq(pool.coverageByLandlord(landlord), COVER);
    }

    function test_PolicyManager_firstLossStopsAtCap() public {
        vm.prank(admin);
        pool.setFirstLossCapBps(0);
        _active(COVER, 12);
        assertEq(pool.firstLossBalance(), 0);
        assertEq(usdg.balanceOf(treasury), 3_750_000, "full 25% to treasury once capped");
    }

    function test_PolicyManager_acceptPresetTenantOnly() public {
        vm.prank(landlord);
        uint256 id = pm.createInvite(tenant, "Unit 1", 0, COVER, 12, "", CHECK_IN);
        _mint(stranger, 100e6);
        _approveAll(stranger);
        vm.expectRevert(NotTenant.selector);
        vm.prank(stranger);
        pm.acceptInvite(id);

        vm.prank(tenant);
        pm.acceptInvite(id);
        assertEq(pm.getPolicy(id).tenant, tenant);
    }

    function testRevert_PolicyManager_landlordCannotAcceptOwn() public {
        uint256 id = _invite(COVER, 12);
        vm.expectRevert(SameParty.selector);
        vm.prank(landlord);
        pm.acceptInvite(id);
    }

    function testRevert_PolicyManager_acceptTwice() public {
        uint256 id = _active(COVER, 12);
        vm.expectRevert(abi.encodeWithSelector(InvalidStatus.selector, 0, 1));
        vm.prank(tenant);
        pm.acceptInvite(id);
    }

    function testRevert_PolicyManager_acceptUnknownPolicy() public {
        vm.expectRevert(abi.encodeWithSelector(InvalidStatus.selector, 0, 0));
        vm.prank(tenant);
        pm.acceptInvite(99);
    }

    function testRevert_PolicyManager_reserveCheckedAgainAtAcceptance() public {
        uint256 a = _invite(6_000e6, 12);
        uint256 b = _invite(6_000e6, 12);
        vm.prank(tenant);
        pm.acceptInvite(a);
        vm.expectRevert(abi.encodeWithSelector(ReserveTooLow.selector, 5_034_750_000, 6_000e6));
        vm.prank(tenant);
        pm.acceptInvite(b);
        assertEq(uint8(pm.getPolicy(b).status), uint8(PolicyStatus.Invited));
    }

    function testRevert_PolicyManager_acceptRequiresAllowance() public {
        uint256 id = _invite(COVER, 12);
        address broke = makeAddr("broke");
        vm.expectRevert();
        vm.prank(broke);
        pm.acceptInvite(id);
    }

    function testRevert_PolicyManager_acceptWhenPaused() public {
        uint256 id = _invite(COVER, 12);
        vm.prank(admin);
        pm.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(tenant);
        pm.acceptInvite(id);
    }

    function test_PolicyManager_quoteForShowsTenantTier() public {
        uint256 id = _invite(COVER, 12);
        (uint256 monthly, RiskTier tier, bool blocked) = pm.quoteFor(id, tenant);
        assertEq(monthly, 15e6);
        assertEq(uint8(tier), uint8(RiskTier.B));
        assertFalse(blocked);
    }

    // ───────────── check-in evidence ─────────────

    function test_PolicyManager_tenantAddsMoveInNotes() public {
        uint256 id = _active(COVER, 12);
        vm.expectEmit(true, false, false, true);
        emit PolicyManager.CheckInEvidenceAdded(id, "bafkreitenant", keccak256("tenant notes"));
        vm.prank(tenant);
        pm.addCheckInEvidence(id, "bafkreitenant", keccak256("tenant notes"));
        Policy memory p = pm.getPolicy(id);
        assertEq(p.tenantCheckInCid, "bafkreitenant");
        assertEq(p.tenantCheckInHash, keccak256("tenant notes"));
    }

    function testRevert_PolicyManager_moveInNotesAfterWindow() public {
        uint256 id = _active(COVER, 12);
        vm.warp(block.timestamp + t.checkInWindow + 1);
        vm.expectRevert(WindowClosed.selector);
        vm.prank(tenant);
        pm.addCheckInEvidence(id, "bafkreitenant", keccak256("x"));
    }

    function testRevert_PolicyManager_moveInNotesOnlyTenant() public {
        uint256 id = _active(COVER, 12);
        vm.expectRevert(NotTenant.selector);
        vm.prank(landlord);
        pm.addCheckInEvidence(id, "bafkreitenant", keccak256("x"));
        vm.expectRevert(StringTooLong.selector);
        vm.prank(tenant);
        pm.addCheckInEvidence(id, "", keccak256("x"));
    }

    // ───────────── payPremium ─────────────

    function test_PolicyManager_payPremiumAdvancesSchedule() public {
        uint256 id = _active(COVER, 12);
        uint64 start = pm.getPolicy(id).startTime;
        vm.warp(start + 1 minutes);
        vm.prank(tenant);
        pm.payPremium(id);
        Policy memory p = pm.getPolicy(id);
        assertEq(p.periodsPaid, 2);
        assertEq(p.nextPremiumDue, start + 2 minutes);
        assertEq(usdg.balanceOf(treasury), 4_500_000);
    }

    function test_PolicyManager_payPremiumAheadAndByAnyone() public {
        uint256 id = _active(COVER, 12);
        _mint(stranger, 100e6);
        _approveAll(stranger);
        vm.prank(stranger);
        pm.payPremium(id);
        _payAll(id);
        Policy memory p = pm.getPolicy(id);
        assertEq(p.periodsPaid, 12);
        assertEq(p.nextPremiumDue, 0);
    }

    function testRevert_PolicyManager_payPremiumWhenAllPaid() public {
        uint256 id = _active(COVER, 12);
        _payAll(id);
        vm.expectRevert(PremiumNotDue.selector);
        vm.prank(tenant);
        pm.payPremium(id);
    }

    function testRevert_PolicyManager_payPremiumAfterGrace() public {
        uint256 id = _active(COVER, 12);
        vm.warp(pm.getPolicy(id).nextPremiumDue + t.gracePeriod + 1);
        vm.expectRevert(WindowClosed.selector);
        vm.prank(tenant);
        pm.payPremium(id);
    }

    function test_PolicyManager_payPremiumWithinGrace() public {
        uint256 id = _active(COVER, 12);
        vm.warp(pm.getPolicy(id).nextPremiumDue + t.gracePeriod);
        vm.prank(tenant);
        pm.payPremium(id);
        assertEq(pm.getPolicy(id).periodsPaid, 2);
    }

    // ───────────── keeper transitions ─────────────

    function testRevert_PolicyManager_markLapsedTooEarly() public {
        uint256 id = _active(COVER, 12);
        vm.warp(pm.getPolicy(id).nextPremiumDue + t.gracePeriod);
        vm.expectRevert(WindowNotOpen.selector);
        pm.markLapsed(id);
    }

    function test_PolicyManager_markLapsedKeepsCoverageAndOpensWindow() public {
        uint256 id = _lapsed(COVER, 12);
        Policy memory p = pm.getPolicy(id);
        assertEq(uint8(p.status), uint8(PolicyStatus.Lapsed));
        assertEq(p.lapsedAt, block.timestamp);
        assertEq(pool.activeCoverage(), COVER, "damage before the lapse is still covered");
        assertEq(pm.claimWindowEnd(id), block.timestamp + t.claimWindow);
    }

    function test_PolicyManager_lapsedPolicyClosesWithoutCleanRecord() public {
        uint256 id = _lapsed(COVER, 12);
        vm.warp(pm.claimWindowEnd(id) + 1);
        pm.closeIfNoClaim(id);
        assertEq(uint8(pm.getPolicy(id).status), uint8(PolicyStatus.Closed));
        assertEq(pool.activeCoverage(), 0);
        assertEq(registry.recordOf(tenant).cleanCompleted, 0);
    }

    function testRevert_PolicyManager_markLapsedFullyPaid() public {
        uint256 id = _active(COVER, 12);
        _payAll(id);
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(PremiumNotDue.selector);
        pm.markLapsed(id);
    }

    function testRevert_PolicyManager_endLeaseBeforeEnd() public {
        uint256 id = _active(COVER, 12);
        _payAll(id);
        vm.warp(pm.getPolicy(id).endTime - 1);
        vm.expectRevert(WindowNotOpen.selector);
        pm.endLease(id);
    }

    function testRevert_PolicyManager_endLeasePremiumsOutstanding() public {
        uint256 id = _active(COVER, 12);
        vm.warp(pm.getPolicy(id).endTime);
        vm.expectRevert(PremiumsOutstanding.selector);
        pm.endLease(id);
    }

    function test_PolicyManager_endLeaseOpensClaimWindow() public {
        uint256 id = _active(COVER, 12);
        _payAll(id);
        uint64 end = pm.getPolicy(id).endTime;
        vm.warp(end);
        vm.expectEmit(true, false, false, true);
        emit PolicyManager.LeaseEnded(id, end + t.claimWindow);
        vm.prank(keeper);
        pm.endLease(id);
        assertEq(uint8(pm.getPolicy(id).status), uint8(PolicyStatus.Ended));
        assertEq(pool.activeCoverage(), COVER, "still covered during claim window");
        assertEq(pm.claimWindowEnd(id), end + t.claimWindow);
    }

    function testRevert_PolicyManager_closeDuringWindow() public {
        uint256 id = _ended(COVER, 12);
        vm.warp(pm.claimWindowEnd(id));
        vm.expectRevert(WindowNotOpen.selector);
        pm.closeIfNoClaim(id);
    }

    function test_PolicyManager_closeReleasesCoverageAndRecordsClean() public {
        uint256 id = _ended(COVER, 12);
        vm.warp(pm.claimWindowEnd(id) + 1);
        vm.expectEmit(true, false, false, true);
        emit PolicyManager.PolicyClosed(id, true);
        vm.prank(keeper);
        pm.closeIfNoClaim(id);
        assertEq(uint8(pm.getPolicy(id).status), uint8(PolicyStatus.Closed));
        assertEq(pool.activeCoverage(), 0);
        assertEq(pool.coverageByLandlord(landlord), 0);
        assertEq(registry.recordOf(tenant).cleanCompleted, 1);
    }

    function test_PolicyManager_closeAutoEndsActivePolicy() public {
        uint256 id = _active(COVER, 12);
        _payAll(id);
        vm.warp(pm.claimWindowEnd(id) + 1);
        pm.closeIfNoClaim(id);
        assertEq(uint8(pm.getPolicy(id).status), uint8(PolicyStatus.Closed));
    }

    function testRevert_PolicyManager_claimHooksOnlyClaimManager() public {
        uint256 id = _ended(COVER, 12);
        vm.expectRevert();
        vm.prank(landlord);
        pm.onClaimFiled(id);
        vm.expectRevert();
        vm.prank(landlord);
        pm.onClaimSettled(id, true);
    }

    // ───────────── admin ─────────────

    function test_PolicyManager_adminSetters() public {
        vm.startPrank(admin);
        vm.expectRevert(ParamOutOfBounds.selector);
        pm.setProtocolFeeBps(4_001);
        pm.setProtocolFeeBps(3_000);
        vm.expectRevert(ParamOutOfBounds.selector);
        pm.setFirstLossShareBps(10_001);
        pm.setFirstLossShareBps(5_000);
        vm.expectRevert(ParamOutOfBounds.selector);
        pm.setMaxCoveragePerPolicy(0);
        pm.setMaxCoveragePerPolicy(20_000e6);
        vm.expectRevert(ZeroAddress.selector);
        pm.setTreasury(address(0));
        pm.setTreasury(stranger);
        PremiumCalculatorSol c2 = new PremiumCalculatorSol(6);
        pm.setCalculator(IPremiumCalculator(address(c2)));
        vm.stopPrank();

        assertEq(pm.protocolFeeBps(), 3_000);
        assertEq(pm.firstLossShareBps(), 5_000);
        assertEq(pm.maxCoveragePerPolicy(), 20_000e6);
        assertEq(pm.treasury(), stranger);
        assertEq(address(pm.calculator()), address(c2));
    }

    function testRevert_PolicyManager_adminOnly() public {
        vm.startPrank(stranger);
        vm.expectRevert();
        pm.setProtocolFeeBps(1_000);
        vm.expectRevert();
        pm.pause();
        vm.expectRevert();
        pm.setTreasury(stranger);
        vm.stopPrank();
    }

    function testRevert_PolicyManager_constructorRejectsBadConfig() public {
        TimeConfig memory bad = TimeProfiles.demo();
        bad.premiumPeriod = 0;
        vm.expectRevert(ParamOutOfBounds.selector);
        new PolicyManager(usdg, pool, registry, IPremiumCalculator(address(calc)), treasury, admin, bad);

        vm.expectRevert(ZeroAddress.selector);
        new PolicyManager(usdg, pool, registry, IPremiumCalculator(address(calc)), address(0), admin, t);
    }

    function test_PolicyManager_views() public view {
        (uint256 monthly,) = pm.quote(COVER, 12, RiskTier.C);
        assertEq(monthly, 19_500_000);
        assertEq(pm.timeConfig().premiumPeriod, 1 minutes);
        (uint256 toPool, uint256 toFirstLoss, uint256 toTreasury) = pm.splitPremium(15e6);
        assertEq(toPool, 11_250_000);
        assertEq(toFirstLoss, 1_500_000);
        assertEq(toTreasury, 2_250_000);
    }
}
