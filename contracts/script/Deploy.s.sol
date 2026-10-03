// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {GuaranteePool} from "../src/GuaranteePool.sol";
import {PolicyManager} from "../src/PolicyManager.sol";
import {ClaimManager} from "../src/ClaimManager.sol";
import {TenantRegistry} from "../src/TenantRegistry.sol";
import {PremiumCalculatorSol} from "../src/PremiumCalculatorSol.sol";
import {IPremiumCalculator} from "../src/interfaces/IPremiumCalculator.sol";
import {MockTBillVault} from "../src/yield/MockTBillVault.sol";
import {TBillAdapter} from "../src/yield/TBillAdapter.sol";
import {MockGdnRewardsDistributor} from "../src/yield/MockGdnRewardsDistributor.sol";
import {TimeConfig, TimeProfiles} from "../src/libraries/Types.sol";

/// @title Deploy
/// @notice Deploys the full protocol. WRITTEN, NOT EXECUTED BY THE AGENT — run it yourself, e.g.:
///
///   forge script script/Deploy.s.sol:Deploy --rpc-url arbitrum_sepolia --account deployer --broadcast
///
/// Configuration (all optional, read from env):
///   TIME_PROFILE           "demo" (default, 1 minute = 1 month) or "prod"
///   USE_MOCK_USDG          true → deploy MockUSDG (public mint) instead of using Paxos test USDG
///   USDG_ADDRESS           override the USDG token address
///   STYLUS_CALCULATOR      address of the deployed Stylus PremiumCalculator; unset → deploy PremiumCalculatorSol
///   TREASURY_ADDRESS       protocol fee receiver (default: deployer)
///   ARBITER_ADDRESS        first arbiter (default: deployer)
///   SEED_DEPOSIT           first pool deposit in base units, kept by the deployer (default 1 USDG)
///   YIELD_TIME_MULTIPLIER  simulated T-bill and GDN speed-up (default 43,200 in demo: 1 minute = 1 month)
///   TBILL_YIELD_RESERVE    USDG (base units) pre-funded so the vault can pay simulated interest
///   GDN_REWARDS_RESERVE    USDG (base units) pre-funded so the distributor can pay simulated rewards
///                          (both default to 1,000 USDG with MockUSDG and 0 with real USDG — fund them later)
contract Deploy is Script {
    // Paxos USDG testnet tokens (SPEC §7.13).
    address internal constant USDG_ARBITRUM_SEPOLIA = 0xFFC95faa3d63Cde504a05B567C600B78C0b41892;
    address internal constant USDG_ROBINHOOD_TESTNET = 0x7E955252E15c84f5768B83c41a71F9eba181802F;
    uint256 internal constant ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
    // Robinhood Chain testnet (docs.robinhood.com/chain/connecting); override with ROBINHOOD_CHAIN_ID if it changes.
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID_DEFAULT = 46630;

    struct Deployment {
        address usdg;
        address calculator;
        address registry;
        address pool;
        address policyManager;
        address claimManager;
        address tbillVault;
        address tbillAdapter;
        address gdnDistributor;
        uint256 deployBlock;
    }

    Deployment internal d;
    address internal deployer;
    bool internal isDemo;
    bool internal mock;
    uint8 internal decimals;

    function run() external returns (Deployment memory) {
        isDemo = keccak256(bytes(vm.envOr("TIME_PROFILE", string("demo")))) == keccak256("demo");

        vm.startBroadcast();
        (, deployer,) = vm.readCallers();
        d.deployBlock = block.number;

        // 1. USDG
        d.usdg = _resolveUsdg();
        decimals = IERC20Metadata(d.usdg).decimals();
        mock = _isMock(d.usdg);

        // 2. Premium calculator: Stylus if provided, else the Solidity version with the identical ABI.
        d.calculator = vm.envOr("STYLUS_CALCULATOR", address(0));
        if (d.calculator == address(0)) d.calculator = address(new PremiumCalculatorSol(decimals));

        _deployCore();
        _deployYield();
        _wire();
        _seedAndFund();

        vm.stopBroadcast();
        _log();
        return d;
    }

    /// 3. Registry, pool, policy and claim managers.
    function _deployCore() internal {
        TimeConfig memory time = isDemo ? TimeProfiles.demo() : TimeProfiles.prod();
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        address arbiter = vm.envOr("ARBITER_ADDRESS", deployer);
        TenantRegistry registry = new TenantRegistry(deployer);
        GuaranteePool pool = new GuaranteePool(IERC20(d.usdg), deployer);
        PolicyManager pm = new PolicyManager(
            IERC20(d.usdg), pool, registry, IPremiumCalculator(d.calculator), treasury, deployer, time
        );
        ClaimManager cm = new ClaimManager(IERC20(d.usdg), pool, pm, registry, deployer, arbiter);
        d.registry = address(registry);
        d.pool = address(pool);
        d.policyManager = address(pm);
        d.claimManager = address(cm);
    }

    /// 4. Yield sources (testnet: simulated T-bills + simulated GDN partner rewards).
    function _deployYield() internal {
        uint256 multiplier = vm.envOr("YIELD_TIME_MULTIPLIER", isDemo ? uint256(43_200) : uint256(1));
        MockTBillVault vault = new MockTBillVault(IERC20(d.usdg), deployer);
        TBillAdapter adapter = new TBillAdapter(vault, d.pool);
        MockGdnRewardsDistributor gdn = new MockGdnRewardsDistributor(IERC20(d.usdg), GuaranteePool(d.pool), deployer);
        vault.setTimeMultiplier(multiplier);
        gdn.setTimeMultiplier(multiplier);
        d.tbillVault = address(vault);
        d.tbillAdapter = address(adapter);
        d.gdnDistributor = address(gdn);
    }

    /// 5. Roles and wiring.
    function _wire() internal {
        GuaranteePool pool = GuaranteePool(d.pool);
        PolicyManager pm = PolicyManager(d.policyManager);
        TenantRegistry registry = TenantRegistry(d.registry);
        pool.grantRole(pool.POLICY_MANAGER_ROLE(), d.policyManager);
        pool.grantRole(pool.CLAIM_MANAGER_ROLE(), d.claimManager);
        pool.grantRole(pool.REWARDS_ROLE(), d.gdnDistributor);
        pm.grantRole(pm.CLAIM_MANAGER_ROLE(), d.claimManager);
        registry.grantRole(registry.WRITER_ROLE(), d.policyManager);
        registry.grantRole(registry.WRITER_ROLE(), d.claimManager);
        pool.setYieldAdapter(TBillAdapter(d.tbillAdapter));
    }

    /// 6. Seed deposit (inflation-attack mitigation) and 7. reserves for simulated yield.
    function _seedAndFund() internal {
        uint256 seed = vm.envOr("SEED_DEPOSIT", 10 ** decimals);
        if (mock) MockUSDG(d.usdg).mint(deployer, seed);
        IERC20(d.usdg).approve(d.pool, seed);
        GuaranteePool(d.pool).deposit(seed, deployer);

        uint256 defaultReserve = mock ? 1_000 * 10 ** decimals : 0;
        uint256 tbillReserve = vm.envOr("TBILL_YIELD_RESERVE", defaultReserve);
        uint256 gdnReserve = vm.envOr("GDN_REWARDS_RESERVE", defaultReserve);
        if (mock) MockUSDG(d.usdg).mint(deployer, tbillReserve + gdnReserve);
        if (tbillReserve > 0) {
            IERC20(d.usdg).approve(d.tbillVault, tbillReserve);
            MockTBillVault(d.tbillVault).fundYieldReserve(tbillReserve);
        } else {
            console.log("WARNING: T-bill reserve empty. Fund it: MockTBillVault.fundYieldReserve");
        }
        if (gdnReserve > 0) {
            IERC20(d.usdg).approve(d.gdnDistributor, gdnReserve);
            MockGdnRewardsDistributor(d.gdnDistributor).fund(gdnReserve);
        } else {
            console.log("WARNING: GDN reserve empty. Fund it: MockGdnRewardsDistributor.fund");
        }
    }

    function _resolveUsdg() internal returns (address) {
        if (vm.envOr("USE_MOCK_USDG", false)) return address(new MockUSDG());
        address fromEnv = vm.envOr("USDG_ADDRESS", address(0));
        if (fromEnv != address(0)) return fromEnv;
        if (block.chainid == ARBITRUM_SEPOLIA_CHAIN_ID) return USDG_ARBITRUM_SEPOLIA;
        if (block.chainid == vm.envOr("ROBINHOOD_CHAIN_ID", ROBINHOOD_TESTNET_CHAIN_ID_DEFAULT)) {
            return USDG_ROBINHOOD_TESTNET;
        }
        revert("Set USDG_ADDRESS or USE_MOCK_USDG=true for this chain");
    }

    function _isMock(address token) internal view returns (bool) {
        return token != USDG_ARBITRUM_SEPOLIA && token != USDG_ROBINHOOD_TESTNET
            && keccak256(bytes(IERC20Metadata(token).name())) == keccak256("Mock Global Dollar");
    }

    function _log() internal view {
        console.log("== SafeDeposit Zero deployed (%s profile) ==", isDemo ? "demo" : "prod");
        console.log("Copy into frontend/config/contracts.ts:");
        console.log("  usdg:              ", d.usdg);
        console.log("  premiumCalculator: ", d.calculator);
        console.log("  tenantRegistry:    ", d.registry);
        console.log("  guaranteePool:     ", d.pool);
        console.log("  policyManager:     ", d.policyManager);
        console.log("  claimManager:      ", d.claimManager);
        console.log("  mockTBillVault:    ", d.tbillVault);
        console.log("  tbillAdapter:      ", d.tbillAdapter);
        console.log("  gdnDistributor:    ", d.gdnDistributor);
        console.log("  deployBlock:       ", d.deployBlock);
    }
}
