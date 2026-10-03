// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {TBillAdapter} from "../../src/yield/TBillAdapter.sol";
import {MockTBillVault} from "../../src/yield/MockTBillVault.sol";
import {IYieldAdapter} from "../../src/interfaces/IYieldAdapter.sol";
import {OnlyPool, ParamOutOfBounds, ZeroAmount} from "../../src/libraries/Errors.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract YieldTest is BaseTest {
    function test_vault_accruesLinearly() public {
        _mint(address(this), 10_000 * USDG);
        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(10_000 * USDG);
        vm.warp(block.timestamp + 365 days);
        assertEq(vault.valueOf(address(this)), 10_340 * USDG, "3.4% after one year");
    }

    function test_vault_timeMultiplierSpeedsUpAccrual() public {
        vm.prank(admin);
        vault.setTimeMultiplier(1_440); // 1 minute = 1 day
        _mint(address(this), 10_000 * USDG);
        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(10_000 * USDG);
        vm.warp(block.timestamp + 365 minutes);
        assertEq(vault.valueOf(address(this)), 10_340 * USDG);
    }

    function test_vault_withdrawPaysInterestFromReserve() public {
        _mint(address(this), 1_000 * USDG);
        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(1_000 * USDG);
        vm.warp(block.timestamp + 365 days);
        vault.withdraw(1_034 * USDG);
        assertEq(usdg.balanceOf(address(this)), 1_034 * USDG);
        assertEq(vault.valueOf(address(this)), 0);
    }

    function test_vault_rejectsZeroDeposit() public {
        vm.expectRevert(ZeroAmount.selector);
        vault.deposit(0);
    }

    function test_vault_paramsBoundedAndOwnerOnly() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        vault.setAprBps(100);

        vm.startPrank(admin);
        vm.expectRevert(ParamOutOfBounds.selector);
        vault.setAprBps(2_001);
        vm.expectRevert(ParamOutOfBounds.selector);
        vault.setTimeMultiplier(0);
        vault.setAprBps(500);
        vm.stopPrank();
        assertEq(vault.aprBps(), 500);
    }

    function test_adapter_onlyPool() public {
        vm.expectRevert(OnlyPool.selector);
        adapter.deposit(1);
        vm.expectRevert(OnlyPool.selector);
        adapter.withdraw(1);
    }

    function test_adapter_withdrawCapsAtValue() public {
        _deposit(investor, 1_000 * USDG);
        pool.rebalance();
        uint256 value = adapter.totalValue();
        vm.prank(address(pool));
        uint256 out = adapter.withdraw(value + 1_000 * USDG);
        assertEq(out, value);
    }

    function test_adapter_reportsAsset() public view {
        assertEq(adapter.asset(), address(usdg));
        assertEq(address(IYieldAdapter(address(adapter)).asset()), address(usdg));
    }
}
