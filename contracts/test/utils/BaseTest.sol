// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDG} from "../../src/mocks/MockUSDG.sol";
import {GuaranteePool} from "../../src/GuaranteePool.sol";
import {PolicyManager} from "../../src/PolicyManager.sol";
import {ClaimManager} from "../../src/ClaimManager.sol";
import {TenantRegistry} from "../../src/TenantRegistry.sol";
import {PremiumCalculatorSol} from "../../src/PremiumCalculatorSol.sol";
import {MockTBillVault} from "../../src/yield/MockTBillVault.sol";
import {TBillAdapter} from "../../src/yield/TBillAdapter.sol";
import {MockGdnRewardsDistributor} from "../../src/yield/MockGdnRewardsDistributor.sol";
import {IPremiumCalculator} from "../../src/interfaces/IPremiumCalculator.sol";
import {
    Policy, Claim, Debt, PolicyStatus, ClaimStatus, ClaimType, TimeConfig, TimeProfiles
} from "../../src/libraries/Types.sol";

/// @notice Full protocol, demo time profile, local only.
abstract contract BaseTest is Test {
    uint256 internal constant USDG = 1e6;
    uint128 internal constant COVER = 2_000e6;

    MockUSDG internal usdg;
    GuaranteePool internal pool;
    PolicyManager internal pm;
    ClaimManager internal cm;
    TenantRegistry internal registry;
    PremiumCalculatorSol internal calc;
    MockTBillVault internal vault;
    TBillAdapter internal adapter;
    MockGdnRewardsDistributor internal gdn;
    TimeConfig internal t;

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal arbiter = makeAddr("arbiter");
    address internal landlord = makeAddr("landlord");
    address internal tenant = makeAddr("tenant");
    address internal investor = makeAddr("investor");
    address internal keeper = makeAddr("keeper");
    address internal stranger = makeAddr("stranger");

    string internal constant CHECK_IN_CID = "bafkreicheckin";
    string internal constant CHECK_OUT_CID = "bafkreicheckout";
    bytes32 internal constant CHECK_IN = keccak256("check-in manifest");
    bytes32 internal constant CHECK_OUT = keccak256("check-out manifest");

    function setUp() public virtual {
        vm.warp(1_760_000_000);
        t = TimeProfiles.demo();

        usdg = new MockUSDG();
        calc = new PremiumCalculatorSol(usdg.decimals());
        registry = new TenantRegistry(admin);
        pool = new GuaranteePool(usdg, admin);
        pm = new PolicyManager(usdg, pool, registry, IPremiumCalculator(address(calc)), treasury, admin, t);
        cm = new ClaimManager(usdg, pool, pm, registry, admin, arbiter);
        vault = new MockTBillVault(usdg, admin);
        adapter = new TBillAdapter(vault, address(pool));
        gdn = new MockGdnRewardsDistributor(usdg, pool, admin);

        vm.startPrank(admin);
        pool.grantRole(pool.POLICY_MANAGER_ROLE(), address(pm));
        pool.grantRole(pool.CLAIM_MANAGER_ROLE(), address(cm));
        pool.grantRole(pool.REWARDS_ROLE(), address(gdn));
        pm.grantRole(pm.CLAIM_MANAGER_ROLE(), address(cm));
        registry.grantRole(registry.WRITER_ROLE(), address(pm));
        registry.grantRole(registry.WRITER_ROLE(), address(cm));
        pool.setYieldAdapter(adapter);
        vm.stopPrank();

        // Seed deposit + simulated yield reserves.
        _mint(admin, 2_000 * USDG);
        vm.startPrank(admin);
        usdg.approve(address(pool), type(uint256).max);
        pool.deposit(1 * USDG, admin);
        usdg.approve(address(vault), type(uint256).max);
        vault.fundYieldReserve(500 * USDG);
        usdg.approve(address(gdn), type(uint256).max);
        gdn.fund(500 * USDG);
        vm.stopPrank();

        _mint(tenant, 10_000 * USDG);
        _mint(landlord, 1_000 * USDG);
        _approveAll(tenant);
        _approveAll(landlord);
    }

    // helpers

    function _mint(address to, uint256 amount) internal {
        while (amount > 0) {
            uint256 chunk = amount > usdg.MAX_MINT() ? usdg.MAX_MINT() : amount;
            usdg.mint(to, chunk);
            amount -= chunk;
        }
    }

    function _approveAll(address who) internal {
        vm.startPrank(who);
        usdg.approve(address(pool), type(uint256).max);
        usdg.approve(address(pm), type(uint256).max);
        usdg.approve(address(cm), type(uint256).max);
        vm.stopPrank();
    }

    function _deposit(address who, uint256 amount) internal returns (uint256 shares) {
        _mint(who, amount);
        _approveAll(who);
        vm.prank(who);
        shares = pool.deposit(amount, who);
    }

    function _invite(uint128 coverage, uint32 periods) internal returns (uint256 id) {
        vm.prank(landlord);
        id = pm.createInvite(address(0), "Unit 12B, Orchard", 2_000 * uint128(USDG), coverage, periods, CHECK_IN_CID, CHECK_IN);
    }

    function _activeFor(address who, uint128 coverage, uint32 periods) internal returns (uint256 id) {
        id = _invite(coverage, periods);
        vm.prank(who);
        pm.acceptInvite(id);
    }

    function _active(uint128 coverage, uint32 periods) internal returns (uint256 id) {
        id = _activeFor(tenant, coverage, periods);
    }

    /// Fully paid policy, ended.
    function _ended(uint128 coverage, uint32 periods) internal returns (uint256 id) {
        id = _active(coverage, periods);
        _payAll(id);
        vm.warp(pm.getPolicy(id).endTime);
        vm.prank(keeper);
        pm.endLease(id);
    }

    /// Policy lapsed after a missed premium.
    function _lapsed(uint128 coverage, uint32 periods) internal returns (uint256 id) {
        id = _active(coverage, periods);
        vm.warp(pm.getPolicy(id).nextPremiumDue + t.gracePeriod + 1);
        vm.prank(keeper);
        pm.markLapsed(id);
    }

    function _payAll(uint256 id) internal {
        Policy memory p = pm.getPolicy(id);
        for (uint32 i = p.periodsPaid; i < p.totalPeriods; i++) {
            vm.prank(p.tenant);
            pm.payPremium(id);
        }
    }

    function _fileClaim(uint256 policyId, uint128 amount) internal returns (uint256 claimId) {
        vm.prank(landlord);
        claimId = cm.fileClaim(
            policyId, ClaimType.Damage, amount, CHECK_OUT_CID, CHECK_OUT, "Broken wardrobe door and wall damage"
        );
    }

    function _disputed(uint128 claimAmount) internal returns (uint256 policyId, uint256 claimId) {
        policyId = _ended(COVER, 12);
        claimId = _fileClaim(policyId, claimAmount);
        vm.prank(tenant);
        cm.disputeClaim(claimId, "Wardrobe was already damaged at check-in");
    }

    function _sharePrice() internal view returns (uint256) {
        return pool.convertToAssets(1e18);
    }
}
