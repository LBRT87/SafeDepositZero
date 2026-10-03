// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {GuaranteePool} from "../src/GuaranteePool.sol";
import {PolicyManager} from "../src/PolicyManager.sol";
import {ClaimManager} from "../src/ClaimManager.sol";
import {Policy, ClaimType} from "../src/libraries/Types.sol";

/// @notice Shared config for the seed scripts (SPEC §7.13). WRITTEN, NOT EXECUTED BY THE AGENT.
///
/// The seed fills every dashboard: investor capital, a tenant with a clean history, an active policy, an ended
/// policy in its claim window, a disputed claim and a defaulted debt covered by the first-loss reserve.
/// It runs in three phases because the demo profile counts real minutes (1 minute = 1 month):
///   Phase 1 → wait 6–10 minutes → Phase 2 → wait 6–10 minutes → Phase 3.
///
/// Keys come from YOUR shell at run time (never commit them):
///   INVESTOR_PRIVATE_KEY, LANDLORD_PRIVATE_KEY, TENANT_PRIVATE_KEY, TENANT2_PRIVATE_KEY
/// Deployed addresses: USDG_ADDRESS, POOL_ADDRESS, POLICY_MANAGER_ADDRESS, CLAIM_MANAGER_ADDRESS.
/// Every wallet needs testnet ETH for gas. With real USDG the investor needs ~5,000 and each tenant ~200.
abstract contract SeedBase is Script {
    IERC20 usdg;
    GuaranteePool pool;
    PolicyManager pm;
    ClaimManager cm;
    uint256 unit;

    uint256 investorKey;
    uint256 landlordKey;
    uint256 tenantKey;
    uint256 tenant2Key;

    bytes32 constant CHECK_IN_HASH = keccak256("seed/check-in-manifest-v1");
    bytes32 constant CHECK_OUT_HASH = keccak256("seed/check-out-manifest-v1");
    // TODO: replace with the CIDs of real manifests pinned through /api/evidence if you want photos in the UI.
    string constant CHECK_IN_CID = "";
    string constant CHECK_OUT_CID = "";

    function _load() internal {
        usdg = IERC20(vm.envAddress("USDG_ADDRESS"));
        pool = GuaranteePool(vm.envAddress("POOL_ADDRESS"));
        pm = PolicyManager(vm.envAddress("POLICY_MANAGER_ADDRESS"));
        cm = ClaimManager(vm.envAddress("CLAIM_MANAGER_ADDRESS"));
        unit = 10 ** IERC20Metadata(address(usdg)).decimals();
        investorKey = vm.envUint("INVESTOR_PRIVATE_KEY");
        landlordKey = vm.envUint("LANDLORD_PRIVATE_KEY");
        tenantKey = vm.envUint("TENANT_PRIVATE_KEY");
        tenant2Key = vm.envUint("TENANT2_PRIVATE_KEY");
    }

    function _maybeMint(address to, uint256 amount) internal {
        if (vm.envOr("USE_MOCK_USDG", false)) MockUSDG(address(usdg)).mint(to, amount);
    }

    function _invite(address tenant, string memory ref, uint256 amount, uint32 periods) internal returns (uint256) {
        return pm.createInvite(
            tenant, ref, uint128(amount), uint128(amount), periods, CHECK_IN_CID, CHECK_IN_HASH
        );
    }

    function _acceptAndPrepay(uint256 id) internal {
        pm.acceptInvite(id);
        Policy memory p = pm.getPolicy(id);
        for (uint32 i = p.periodsPaid; i < p.totalPeriods; i++) {
            pm.payPremium(id);
        }
    }

    function _setupTenant(uint256 key, uint256 amount) internal {
        address who = vm.addr(key);
        vm.startBroadcast(key);
        _maybeMint(who, amount);
        usdg.approve(address(pm), type(uint256).max);
        usdg.approve(address(cm), type(uint256).max);
        vm.stopBroadcast();
    }
}

/// @notice Phase 1:
///   forge script script/Seed.s.sol:SeedPhase1 --rpc-url arbitrum_sepolia --broadcast
contract SeedPhase1 is SeedBase {
    function run() external {
        _load();
        address investor = vm.addr(investorKey);
        address tenant = vm.addr(tenantKey);
        address tenant2 = vm.addr(tenant2Key);

        vm.startBroadcast(investorKey);
        uint256 investorDeposit = vm.envOr("SEED_INVESTOR_DEPOSIT", 5_000 * unit);
        _maybeMint(investor, investorDeposit);
        usdg.approve(address(pool), investorDeposit);
        pool.deposit(investorDeposit, investor);
        vm.stopBroadcast();

        vm.startBroadcast(landlordKey);
        uint256 happyId = _invite(tenant, "Unit 5E, Clementi Ave", 1_500 * unit, 6);
        uint256 disputedId = _invite(tenant, "Unit 2B, Jl. Senopati", 2_000 * unit, 6);
        uint256 defaultId = _invite(tenant2, "Room 3C, Tiong Bahru", 1_000 * unit, 6);
        uint256 activeId = _invite(tenant, "Unit 4D, Orchard Rd", 2_000 * unit, 12);
        _invite(address(0), "Kos Tebet No. 7", 800 * unit, 12); // open invite for the live demo
        vm.stopBroadcast();

        _setupTenant(tenantKey, 1_000 * unit);
        _setupTenant(tenant2Key, 500 * unit);

        // Prepay every period so nothing lapses while the demo clock runs.
        vm.startBroadcast(tenantKey);
        _acceptAndPrepay(happyId);
        _acceptAndPrepay(disputedId);
        _acceptAndPrepay(activeId);
        vm.stopBroadcast();
        vm.startBroadcast(tenant2Key);
        _acceptAndPrepay(defaultId);
        vm.stopBroadcast();

        console.log("Seed phase 1 done. Export these, then run phase 2 in 6-10 minutes:");
        console.log("  SEED_HAPPY_POLICY_ID=", happyId);
        console.log("  SEED_DISPUTED_POLICY_ID=", disputedId);
        console.log("  SEED_DEFAULT_POLICY_ID=", defaultId);
        console.log("  (active 12-month policy:", activeId, ")");
    }
}

/// @notice Phase 2 (6–10 minutes after phase 1, while the 6-month leases are in their claim window):
///   forge script script/Seed.s.sol:SeedPhase2 --rpc-url arbitrum_sepolia --broadcast
contract SeedPhase2 is SeedBase {
    function run() external {
        _load();
        uint256 happyId = vm.envUint("SEED_HAPPY_POLICY_ID");
        uint256 disputedId = vm.envUint("SEED_DISPUTED_POLICY_ID");
        uint256 defaultId = vm.envUint("SEED_DEFAULT_POLICY_ID");

        vm.startBroadcast(landlordKey);
        pm.endLease(happyId);
        pm.endLease(disputedId);
        pm.endLease(defaultId);
        uint256 disputedClaim = cm.fileClaim(
            disputedId, ClaimType.Damage, uint128(300 * unit), CHECK_OUT_CID, CHECK_OUT_HASH,
            "Broken wardrobe door and wall damage"
        );
        uint256 defaultClaim = cm.fileClaim(
            defaultId, ClaimType.Damage, uint128(250 * unit), CHECK_OUT_CID, CHECK_OUT_HASH, "Damaged kitchen counter"
        );
        uint256 endedId = _invite(vm.addr(tenantKey), "Unit 9F, Jl. Thamrin", 1_200 * unit, 6);
        vm.stopBroadcast();

        vm.startBroadcast(tenantKey);
        cm.disputeClaim(disputedClaim, "The wardrobe door was already loose at check-in. See photo 3.");
        _acceptAndPrepay(endedId);
        vm.stopBroadcast();

        vm.startBroadcast(tenant2Key);
        cm.acceptClaim(defaultClaim);
        vm.stopBroadcast();

        console.log("Seed phase 2 done. Export these, then run phase 3 in 6-10 minutes:");
        console.log("  SEED_ENDED_POLICY_ID=", endedId);
        console.log("  SEED_DEFAULT_CLAIM_ID=", defaultClaim);
        console.log("  (disputed claim waiting for the arbiter:", disputedClaim, ")");
    }
}

/// @notice Phase 3 (6–10 minutes after phase 2):
///   forge script script/Seed.s.sol:SeedPhase3 --rpc-url arbitrum_sepolia --broadcast
/// Leaves: a clean history for the tenant (tier A next time), a defaulted debt covered by the first-loss
/// reserve, and an ended policy with its claim window open.
contract SeedPhase3 is SeedBase {
    function run() external {
        _load();
        uint256 happyId = vm.envUint("SEED_HAPPY_POLICY_ID");
        uint256 endedId = vm.envUint("SEED_ENDED_POLICY_ID");
        uint256 defaultClaim = vm.envUint("SEED_DEFAULT_CLAIM_ID");

        vm.startBroadcast(landlordKey);
        pm.closeIfNoClaim(happyId);
        cm.markDefault(defaultClaim);
        pm.endLease(endedId);
        vm.stopBroadcast();

        console.log("Seed phase 3 done. Ended policy in its claim window:", endedId);
    }
}
