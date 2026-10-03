// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {MockGdnRewardsDistributor} from "../../src/yield/MockGdnRewardsDistributor.sol";
import {TenantRegistry} from "../../src/TenantRegistry.sol";
import {RiskTier} from "../../src/libraries/Types.sol";
import {ParamOutOfBounds, ZeroAddress} from "../../src/libraries/Errors.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract RewardsTest is BaseTest {
    function test_Gdn_distributeRaisesSharePrice() public {
        _deposit(investor, 9_999 * USDG); // 10,000 idle
        uint256 price = _sharePrice();
        vm.warp(block.timestamp + 365 days);
        assertEq(gdn.pendingRewards(), 300 * USDG, "3% on 10,000 idle");
        vm.prank(keeper);
        uint256 paid = gdn.distributeRewards();
        assertEq(paid, 300 * USDG);
        assertEq(pool.totalRewardsReceived(), 300 * USDG);
        assertGt(_sharePrice(), price);
        assertEq(gdn.pendingRewards(), 0, "clock resets");
    }

    function test_Gdn_cappedByFundedBalance() public {
        _deposit(investor, 99_999 * USDG); // 100,000 idle → 3,000/yr, only 500 funded
        vm.warp(block.timestamp + 365 days);
        assertEq(gdn.pendingRewards(), 500 * USDG);
        gdn.distributeRewards();
        assertEq(usdg.balanceOf(address(gdn)), 0);
    }

    function test_Gdn_timeMultiplierForDemo() public {
        vm.prank(admin);
        gdn.setTimeMultiplier(43_200); // 1 minute = 1 month
        _deposit(investor, 9_999 * USDG);
        vm.warp(block.timestamp + 12 minutes);
        assertApproxEqAbs(gdn.pendingRewards(), 296 * USDG, 1 * USDG, "~a year of rewards in 12 minutes");
    }

    function test_Gdn_nothingAccruedPaysNothing() public {
        assertEq(gdn.distributeRewards(), 0);
    }

    function testRevert_Gdn_paramsOwnerOnlyAndBounded() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        gdn.setAprBps(100);

        vm.startPrank(admin);
        vm.expectRevert(ParamOutOfBounds.selector);
        gdn.setAprBps(2_001);
        vm.expectRevert(ParamOutOfBounds.selector);
        gdn.setTimeMultiplier(0);
        gdn.setAprBps(500);
        vm.stopPrank();
        assertEq(gdn.gdnAprBps(), 500);
    }

    function testRevert_Gdn_needsRewardsRole() public {
        MockGdnRewardsDistributor rogue = new MockGdnRewardsDistributor(usdg, pool, admin);
        _mint(address(this), 100 * USDG);
        usdg.approve(address(rogue), type(uint256).max);
        rogue.fund(100 * USDG);
        _deposit(investor, 9_999 * USDG);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert();
        rogue.distributeRewards();
    }
}

contract TenantRegistryTest is BaseTest {
    address writer = makeAddr("writer");

    function setUp() public override {
        super.setUp();
        vm.startPrank(admin);
        registry.grantRole(registry.WRITER_ROLE(), writer);
        vm.stopPrank();
    }

    function test_TenantRegistry_tiersFromHistory() public {
        assertEq(uint8(registry.tierOf(tenant)), uint8(RiskTier.B), "new renter");
        vm.prank(writer);
        registry.recordClean(tenant);
        assertEq(uint8(registry.tierOf(tenant)), uint8(RiskTier.A), "clean history");
        vm.prank(writer);
        registry.recordClaimPaid(tenant);
        assertEq(uint8(registry.tierOf(tenant)), uint8(RiskTier.C), "a paid claim");
        assertTrue(registry.isBlocked(tenant), "until the debt is repaid");
        vm.prank(writer);
        registry.recordDebtClosed(tenant);
        assertFalse(registry.isBlocked(tenant));
    }

    function test_TenantRegistry_defaultBlocksForGood() public {
        vm.startPrank(writer);
        registry.recordClaimPaid(tenant);
        registry.recordDefault(tenant);
        registry.recordDebtClosed(tenant);
        vm.stopPrank();
        assertTrue(registry.isBlocked(tenant));
        assertTrue(registry.recordOf(tenant).defaulted);
    }

    function test_TenantRegistry_debtClosedNeverUnderflows() public {
        vm.prank(writer);
        registry.recordDebtClosed(tenant);
        assertEq(registry.recordOf(tenant).openDebts, 0);
    }

    function testRevert_TenantRegistry_writersOnly() public {
        vm.startPrank(stranger);
        vm.expectRevert();
        registry.recordClean(tenant);
        vm.expectRevert();
        registry.recordClaimPaid(tenant);
        vm.expectRevert();
        registry.recordDefault(tenant);
        vm.expectRevert();
        registry.recordDebtClosed(tenant);
        vm.stopPrank();
    }

    function testRevert_TenantRegistry_zeroAdmin() public {
        vm.expectRevert(ZeroAddress.selector);
        new TenantRegistry(address(0));
    }
}
