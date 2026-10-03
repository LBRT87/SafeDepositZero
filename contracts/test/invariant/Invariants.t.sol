// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {BaseTest} from "../utils/BaseTest.sol";
import {MockUSDG} from "../../src/mocks/MockUSDG.sol";
import {GuaranteePool} from "../../src/GuaranteePool.sol";
import {PolicyManager} from "../../src/PolicyManager.sol";
import {ClaimManager} from "../../src/ClaimManager.sol";
import {TenantRegistry} from "../../src/TenantRegistry.sol";
import {MockGdnRewardsDistributor} from "../../src/yield/MockGdnRewardsDistributor.sol";
import {Policy, Claim, PolicyStatus, ClaimType} from "../../src/libraries/Types.sol";

/// @notice Drives random sequences of protocol actions and records ghost state for the invariants.
contract Handler is Test {
    MockUSDG usdg;
    GuaranteePool pool;
    PolicyManager pm;
    ClaimManager cm;
    TenantRegistry registry;
    MockGdnRewardsDistributor gdn;
    address landlord;
    address investor;
    address arbiter;
    address[] tenants;

    uint256 public reserveViolations; // after a successful activation or withdrawal
    uint256 public sharePriceDrops; // outside of claim filing/payment or a default
    uint256 public lastSharePrice;
    uint256 public ghostPolicies;
    uint256 public ghostClaims;
    uint256 public ghostDefaults;
    uint256 public ghostQueueFills;

    constructor(
        MockUSDG usdg_,
        GuaranteePool pool_,
        PolicyManager pm_,
        ClaimManager cm_,
        TenantRegistry registry_,
        MockGdnRewardsDistributor gdn_,
        address landlord_,
        address investor_,
        address arbiter_,
        address[] memory tenants_
    ) {
        usdg = usdg_;
        pool = pool_;
        pm = pm_;
        cm = cm_;
        registry = registry_;
        gdn = gdn_;
        landlord = landlord_;
        investor = investor_;
        arbiter = arbiter_;
        tenants = tenants_;
        lastSharePrice = _sharePrice();
    }

    function _sharePrice() internal view returns (uint256) {
        return pool.convertToAssets(1e18);
    }

    modifier trackPrice(bool mayDrop) {
        _;
        uint256 price = _sharePrice();
        if (!mayDrop && price < lastSharePrice) sharePriceDrops++;
        lastSharePrice = price;
    }

    function _checkReserve() internal {
        if (pool.totalAssets() < pool.requiredReserve(pool.activeCoverage())) reserveViolations++;
    }

    // ───────────── investor actions ─────────────

    function deposit(uint256 amount) external trackPrice(false) {
        amount = bound(amount, 1e6, 50_000e6);
        usdg.mint(investor, amount);
        vm.prank(investor);
        pool.deposit(amount, investor);
    }

    function withdraw(uint256 amount) external trackPrice(false) {
        uint256 max = pool.maxWithdraw(investor);
        if (max == 0) return;
        amount = bound(amount, 1, max);
        vm.prank(investor);
        pool.withdraw(amount, investor, investor);
        _checkReserve();
    }

    function requestRedeem(uint256 shares) external trackPrice(false) {
        uint256 bal = pool.balanceOf(investor);
        if (bal == 0) return;
        shares = bound(shares, 1, bal);
        vm.prank(investor);
        pool.requestRedeem(shares);
    }

    function cancelRedeem(uint256 seed) external trackPrice(false) {
        uint256 n = pool.totalRequests();
        if (n == 0) return;
        vm.prank(investor);
        try pool.cancelRedeem(bound(seed, 0, n - 1)) {} catch {}
    }

    function processQueue(uint256 maxCount) external trackPrice(false) {
        uint256 filled = pool.processQueue(bound(maxCount, 1, 5));
        ghostQueueFills += filled;
        if (filled > 0) _checkReserve(); // paid claims may leave the pool under reserve; payouts must not
    }

    // ───────────── policy actions ─────────────

    function createAndAccept(uint256 coverage, bool sixMonths, uint256 tenantSeed) external trackPrice(false) {
        address tenant = tenants[bound(tenantSeed, 0, tenants.length - 1)];
        if (registry.isBlocked(tenant)) return;
        coverage = bound(coverage, 100e6, 10_000e6);
        if (coverage > pool.maxNewCoverage(landlord)) return;
        vm.prank(landlord);
        uint256 id = pm.createInvite(address(0), "Unit", 0, uint128(coverage), sixMonths ? 6 : 12, "", keccak256("in"));
        vm.prank(tenant);
        pm.acceptInvite(id);
        ghostPolicies++;
        _checkReserve();
    }

    function payPremium(uint256 seed) external trackPrice(false) {
        uint256 id = _pick(seed);
        if (id == 0) return;
        vm.prank(pm.getPolicy(id).tenant);
        try pm.payPremium(id) {} catch {}
    }

    /// Pays every remaining premium and jumps to the lease end so claims become possible.
    function completeLease(uint256 seed) external trackPrice(false) {
        _complete(_pick(seed));
    }

    function _complete(uint256 id) internal {
        if (id == 0) return;
        Policy memory p = pm.getPolicy(id);
        if (p.status != PolicyStatus.Active) return;
        for (uint32 i = p.periodsPaid; i < p.totalPeriods; i++) {
            vm.prank(p.tenant);
            try pm.payPremium(id) {} catch {
                return;
            }
        }
        if (block.timestamp < p.endTime) vm.warp(p.endTime);
    }

    function warp(uint256 secs) external trackPrice(false) {
        vm.warp(block.timestamp + bound(secs, 1, 10 minutes));
    }

    function keeper(uint256 seed) external trackPrice(false) {
        uint256 id = _pick(seed);
        if (id == 0) return;
        try pm.markLapsed(id) {} catch {}
        try pm.endLease(id) {} catch {}
        try pm.closeIfNoClaim(id) {} catch {}
    }

    function rebalance() external trackPrice(false) {
        pool.rebalance();
    }

    function distributeRewards() external trackPrice(false) {
        gdn.distributeRewards();
    }

    // ───────────── claims and debt ─────────────

    function fileAndSettle(uint256 seed, uint256 amount, uint256 mode) external trackPrice(true) {
        uint256 id = _pick(seed);
        if (id == 0) return;
        _complete(id);
        Policy memory p = pm.getPolicy(id);
        amount = bound(amount, 1, p.coverage);
        vm.prank(landlord);
        try cm.fileClaim(id, ClaimType.Damage, uint128(amount), "", keccak256("out"), "damage") returns (
            uint256 claimId
        ) {
            ghostClaims++;
            mode = bound(mode, 0, 3);
            if (mode == 3) return; // leave it pending
            if (mode == 0) {
                vm.prank(p.tenant);
                cm.acceptClaim(claimId);
            } else {
                vm.prank(p.tenant);
                cm.disputeClaim(claimId, "disagree");
                vm.prank(arbiter);
                cm.resolveDispute(claimId, uint128(mode == 1 ? amount / 2 : 0), "decision");
            }
        } catch {}
    }

    function autoAccept(uint256 seed) external trackPrice(true) {
        uint256 count = cm.claimCount();
        if (count == 0) return;
        try cm.autoAcceptClaim(bound(seed, 1, count)) {} catch {}
    }

    function repay(uint256 claimSeed, uint256 amount) external trackPrice(false) {
        uint256 count = cm.claimCount();
        if (count == 0) return;
        uint256 claimId = bound(claimSeed, 1, count);
        address tenant = pm.getPolicy(cm.getClaim(claimId).policyId).tenant;
        amount = bound(amount, 1, 5_000e6);
        vm.prank(tenant);
        try cm.repay(claimId, amount) {} catch {}
    }

    function markDefault(uint256 claimSeed) external trackPrice(true) {
        uint256 count = cm.claimCount();
        if (count == 0) return;
        try cm.markDefault(bound(claimSeed, 1, count)) {
            ghostDefaults++;
        } catch {}
    }

    function _pick(uint256 seed) internal view returns (uint256) {
        uint256 count = pm.policyCount();
        return count == 0 ? 0 : bound(seed, 1, count);
    }
}

contract InvariantsTest is BaseTest {
    Handler handler;

    function setUp() public override {
        super.setUp();
        _deposit(investor, 20_000 * USDG);
        address[] memory tenants = new address[](3);
        for (uint256 i = 0; i < 3; i++) {
            tenants[i] = makeAddr(string.concat("tenant", vm.toString(i)));
            _mint(tenants[i], 1_000_000 * USDG);
            _approveAll(tenants[i]);
        }
        vm.prank(admin);
        gdn.setTimeMultiplier(43_200);

        handler = new Handler(usdg, pool, pm, cm, registry, gdn, landlord, investor, arbiter, tenants);
        targetContract(address(handler));
    }

    function afterInvariant() external view {
        console.log("policies", handler.ghostPolicies());
        console.log("claims", handler.ghostClaims());
        console.log("defaults", handler.ghostDefaults());
        console.log("queue fills", handler.ghostQueueFills());
    }

    /// totalAssets ≥ minReserve × activeCoverage after any activation or withdrawal.
    function invariant_reserveHoldsAfterActivationAndWithdrawal() public view {
        assertEq(handler.reserveViolations(), 0);
    }

    /// Every premium is split exactly: pool + first-loss + treasury = collected.
    function invariant_premiumSplitSumsExactly() public view {
        assertEq(pm.totalPremiumsCollected(), pool.totalPremiumsReceived() + pm.totalProtocolFees());
        assertEq(pool.totalPremiumsReceived() * 10_000, pm.totalPremiumsCollected() * 7_500);
        assertLe(pool.totalFirstLossFunded(), pm.totalProtocolFees());
    }

    /// activeCoverage == Σ coverage of Active / Lapsed / Ended / Claimed policies.
    function invariant_activeCoverageMatchesPolicies() public view {
        uint256 sum;
        uint256 count = pm.policyCount();
        for (uint256 i = 1; i <= count; i++) {
            Policy memory p = pm.getPolicy(i);
            if (
                p.status == PolicyStatus.Active || p.status == PolicyStatus.Lapsed || p.status == PolicyStatus.Ended
                    || p.status == PolicyStatus.Claimed
            ) sum += p.coverage;
        }
        assertEq(pool.activeCoverage(), sum);
    }

    /// The first-loss reserve only shrinks through coverDefault.
    function invariant_firstLossOnlySpentOnDefaults() public view {
        assertEq(pool.firstLossBalance(), pool.totalFirstLossFunded() - pool.totalFirstLossCovered());
    }

    /// The share price only drops when a claim is filed or paid, or a default isn't fully covered.
    function invariant_sharePriceOnlyDropsOnClaimsOrDefaults() public view {
        assertEq(handler.sharePriceDrops(), 0);
    }

    /// Approved ≤ claimed ≤ coverage.
    function invariant_claimsBounded() public view {
        uint256 count = cm.claimCount();
        for (uint256 i = 1; i <= count; i++) {
            Claim memory c = cm.getClaim(i);
            assertLe(c.amountApproved, c.amountClaimed);
            assertLe(c.amountClaimed, pm.getPolicy(c.policyId).coverage);
        }
    }

    /// Escrowed queue shares are always held by the pool.
    function invariant_queueEscrowBacked() public view {
        assertEq(pool.balanceOf(address(pool)), pool.queuedShares());
    }
}
