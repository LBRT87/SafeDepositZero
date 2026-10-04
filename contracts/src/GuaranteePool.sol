// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IYieldAdapter} from "./interfaces/IYieldAdapter.sol";
import {
    ReserveTooLow,
    ConcentrationTooHigh,
    ZeroAddress,
    ZeroAmount,
    ParamOutOfBounds,
    InsufficientLiquidity,
    NotRequestOwner,
    PoolUnderwater
} from "./libraries/Errors.sol";

/// @title GuaranteePool
/// @notice ERC-4626 USDG vault backing rental deposit guarantees.
contract GuaranteePool is ERC4626, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant POLICY_MANAGER_ROLE = keccak256("POLICY_MANAGER_ROLE");
    bytes32 public constant CLAIM_MANAGER_ROLE = keccak256("CLAIM_MANAGER_ROLE");
    bytes32 public constant REWARDS_ROLE = keccak256("REWARDS_ROLE");

    uint256 public constant BPS = 10_000;
    uint256 public constant MIN_RESERVE_FLOOR_BPS = 3_000;
    uint256 public constant MAX_FIRST_LOSS_CAP_BPS = 2_000;

    struct RedeemRequest {
        address owner;
        uint128 shares; // 0 once processed or cancelled
        uint64 requestedAt;
    }

    uint256 private immutable _unit; // 1 USDG in base units

    uint256 public minReserveBps = 5_000;
    uint256 public liquidityTargetBps = 4_000;
    uint256 public firstLossCapBps = 500;
    uint256 public maxLandlordShareBps = 1_000;
    uint256 public concentrationFloor;

    uint256 public activeCoverage;
    mapping(address => uint256) public coverageByLandlord;
    uint256 public firstLossBalance;
    uint256 public pendingClaimsLiability;
    IYieldAdapter public yieldAdapter;

    RedeemRequest[] private _requests;
    uint256 public queueHead;
    uint256 public queuedShares;

    // Lifetime totals
    uint256 public totalPremiumsReceived;
    uint256 public totalFirstLossFunded;
    uint256 public totalFirstLossCovered;
    uint256 public totalClaimsPaid;
    uint256 public totalRecoveries;
    uint256 public totalRewardsReceived;

    event CoverageChanged(address indexed landlord, uint256 landlordCoverage, uint256 activeCoverage);
    event PendingClaimsChanged(uint256 pendingClaimsLiability);
    event PremiumReceived(uint256 toPool, uint256 toFirstLoss);
    event RepaymentReceived(uint256 amount);
    event RewardsReceived(uint256 amount);
    event FirstLossUsed(uint256 covered, uint256 firstLossBalance);
    event ClaimPayout(address indexed landlord, uint256 amount);
    event Rebalanced(uint256 idleAfter, uint256 adapterValueAfter);
    event RedeemRequested(uint256 indexed requestId, address indexed owner, uint256 shares);
    event RedeemProcessed(uint256 indexed requestId, address indexed owner, uint256 shares, uint256 assets);
    event RedeemCancelled(uint256 indexed requestId, address indexed owner, uint256 shares);
    event YieldAdapterUpdated(address indexed adapter);
    event ParamsUpdated(bytes32 indexed key, uint256 value);

    constructor(IERC20 usdg, address admin) ERC4626(usdg) ERC20("SafeDeposit Pool Share", "sdUSDG") {
        if (address(usdg) == address(0) || admin == address(0)) revert ZeroAddress();
        _unit = 10 ** IERC20Metadata(address(usdg)).decimals();
        concentrationFloor = 20_000 * _unit;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // Views

    /// @notice Idle USDG + adapter value.
    function grossAssets() public view returns (uint256) {
        uint256 adapterValue = address(yieldAdapter) == address(0) ? 0 : yieldAdapter.totalValue();
        return idleAssets() + adapterValue;
    }

    /// @notice Investor assets: gross minus first-loss and pending claims.
    function totalAssets() public view override returns (uint256) {
        uint256 gross = grossAssets();
        uint256 held = firstLossBalance + pendingClaimsLiability;
        return gross > held ? gross - held : 0;
    }

    function idleAssets() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @notice Reserve required for `coverage`.
    function requiredReserve(uint256 coverage) public view returns (uint256) {
        return Math.mulDiv(coverage, minReserveBps, BPS, Math.Rounding.Ceil);
    }

    /// @notice totalAssets / activeCoverage, in bps.
    function reserveRatioBps() public view returns (uint256) {
        if (activeCoverage == 0) return type(uint256).max;
        return Math.mulDiv(totalAssets(), BPS, activeCoverage);
    }

    /// @notice activeCoverage / totalAssets, in bps.
    function utilizationBps() public view returns (uint256) {
        uint256 assets = totalAssets();
        if (assets == 0) return activeCoverage == 0 ? 0 : type(uint256).max;
        return Math.mulDiv(activeCoverage, BPS, assets);
    }

    /// @notice Assets not backing active coverage.
    function freeAssets() public view returns (uint256) {
        uint256 assets = totalAssets();
        uint256 required = requiredReserve(activeCoverage);
        return assets > required ? assets - required : 0;
    }

    /// @notice Max coverage at the reserve minimum.
    function capacity() public view returns (uint256) {
        return Math.mulDiv(totalAssets(), BPS, minReserveBps);
    }

    /// @notice Max coverage per landlord.
    function landlordLimit() public view returns (uint256) {
        return Math.max(concentrationFloor, Math.mulDiv(capacity(), maxLandlordShareBps, BPS));
    }

    /// @notice New coverage `landlord` can still add.
    function maxNewCoverage(address landlord) external view returns (uint256) {
        uint256 cap = capacity();
        uint256 byReserve = cap > activeCoverage ? cap - activeCoverage : 0;
        uint256 limit = landlordLimit();
        uint256 used = coverageByLandlord[landlord];
        uint256 byConcentration = limit > used ? limit - used : 0;
        return Math.min(byReserve, byConcentration);
    }

    /// @notice Room left in the first-loss reserve.
    function firstLossRoom() public view returns (uint256) {
        uint256 cap = Math.mulDiv(totalAssets(), firstLossCapBps, BPS);
        return cap > firstLossBalance ? cap - firstLossBalance : 0;
    }

    function queueLength() external view returns (uint256) {
        return _requests.length - queueHead;
    }

    function totalRequests() external view returns (uint256) {
        return _requests.length;
    }

    function getRedeemRequest(uint256 requestId) external view returns (RedeemRequest memory) {
        return _requests[requestId];
    }

    // ERC-4626 overrides

    function _decimalsOffset() internal pure override returns (uint8) {
        return 6; // inflation-attack guard
    }

    /// @notice True when claims exceed investor assets; deposits are blocked.
    function isUnderwater() public view returns (bool) {
        return totalSupply() > 0 && totalAssets() == 0;
    }

    function maxDeposit(address receiver) public view override returns (uint256) {
        return paused() || isUnderwater() ? 0 : super.maxDeposit(receiver);
    }

    function maxMint(address receiver) public view override returns (uint256) {
        return paused() || isUnderwater() ? 0 : super.maxMint(receiver);
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner), freeAssets());
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        return Math.min(super.maxRedeem(owner), _convertToShares(freeAssets(), Math.Rounding.Floor));
    }

    function deposit(uint256 assets, address receiver) public override nonReentrant whenNotPaused returns (uint256) {
        if (assets == 0) revert ZeroAmount();
        if (isUnderwater()) revert PoolUnderwater();
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver) public override nonReentrant whenNotPaused returns (uint256) {
        if (shares == 0) revert ZeroAmount();
        if (isUnderwater()) revert PoolUnderwater();
        return super.mint(shares, receiver);
    }

    /// @dev Works while paused, within free assets.
    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256)
    {
        if (assets == 0) revert ZeroAmount();
        _checkReserveAfterWithdraw(assets);
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner) public override nonReentrant returns (uint256) {
        if (shares == 0) revert ZeroAmount();
        _checkReserveAfterWithdraw(previewRedeem(shares));
        return super.redeem(shares, receiver, owner);
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        _ensureLiquidity(assets);
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    // Withdrawal queue

    /// @notice Escrows shares for later redemption.
    function requestRedeem(uint256 shares) external nonReentrant returns (uint256 requestId) {
        if (shares == 0) revert ZeroAmount();
        _transfer(msg.sender, address(this), shares);
        requestId = _requests.length;
        _requests.push(
            RedeemRequest({
                owner: msg.sender, shares: SafeCast.toUint128(shares), requestedAt: uint64(block.timestamp)
            })
        );
        queuedShares += shares;
        emit RedeemRequested(requestId, msg.sender, shares);
    }

    /// @notice Returns unprocessed escrowed shares.
    function cancelRedeem(uint256 requestId) external nonReentrant {
        RedeemRequest storage r = _requests[requestId];
        if (r.owner != msg.sender) revert NotRequestOwner();
        uint256 shares = r.shares;
        if (shares == 0) revert ZeroAmount();
        r.shares = 0;
        queuedShares -= shares;
        _transfer(address(this), msg.sender, shares);
        emit RedeemCancelled(requestId, msg.sender, shares);
    }

    /// @notice Pays queued requests in FIFO order. Permissionless.
    function processQueue(uint256 maxCount) external nonReentrant returns (uint256 processed) {
        uint256 i = queueHead;
        uint256 end = _requests.length;
        uint256 steps;
        while (i < end && steps < maxCount) {
            RedeemRequest storage r = _requests[i];
            uint256 shares = r.shares;
            if (shares > 0) {
                uint256 assets = previewRedeem(shares);
                if (assets > freeAssets()) break;
                r.shares = 0;
                queuedShares -= shares;
                _burn(address(this), shares);
                _ensureLiquidity(assets);
                IERC20(asset()).safeTransfer(r.owner, assets);
                emit RedeemProcessed(i, r.owner, shares, assets);
                processed++;
            }
            i++;
            steps++;
        }
        queueHead = i;
    }

    // Protocol hooks

    /// @notice Adds coverage; enforces reserve and concentration.
    function increaseCoverage(address landlord, uint256 amount)
        external
        onlyRole(POLICY_MANAGER_ROLE)
        whenNotPaused
    {
        if (amount == 0) revert ZeroAmount();
        uint256 newCoverage = activeCoverage + amount;
        uint256 required = requiredReserve(newCoverage);
        uint256 current = totalAssets();
        if (current < required) revert ReserveTooLow(current, required);

        uint256 landlordCoverage = coverageByLandlord[landlord] + amount;
        uint256 limit = landlordLimit();
        if (landlordCoverage > limit) revert ConcentrationTooHigh(landlordCoverage, limit);

        activeCoverage = newCoverage;
        coverageByLandlord[landlord] = landlordCoverage;
        emit CoverageChanged(landlord, landlordCoverage, newCoverage);
    }

    /// @notice Releases coverage.
    function decreaseCoverage(address landlord, uint256 amount) external onlyRole(POLICY_MANAGER_ROLE) {
        activeCoverage -= amount;
        coverageByLandlord[landlord] -= amount;
        emit CoverageChanged(landlord, coverageByLandlord[landlord], activeCoverage);
    }

    /// @notice Records a premium already transferred in.
    function receivePremium(uint256 toPool, uint256 toFirstLoss) external onlyRole(POLICY_MANAGER_ROLE) {
        totalPremiumsReceived += toPool;
        if (toFirstLoss > 0) {
            firstLossBalance += toFirstLoss;
            totalFirstLossFunded += toFirstLoss;
        }
        emit PremiumReceived(toPool, toFirstLoss);
    }

    /// @notice Holds a filed claim against investor assets.
    function addPendingClaim(uint256 amount) external onlyRole(CLAIM_MANAGER_ROLE) {
        pendingClaimsLiability += amount;
        emit PendingClaimsChanged(pendingClaimsLiability);
    }

    /// @notice Swaps the claimed amount for the approved one.
    function updatePendingClaim(uint256 oldAmount, uint256 newAmount) external onlyRole(CLAIM_MANAGER_ROLE) {
        pendingClaimsLiability = pendingClaimsLiability - oldAmount + newAmount;
        emit PendingClaimsChanged(pendingClaimsLiability);
    }

    /// @notice Pays an approved claim to the landlord.
    function payClaim(address landlord, uint256 amount) external onlyRole(CLAIM_MANAGER_ROLE) nonReentrant {
        if (landlord == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        pendingClaimsLiability -= amount;
        totalClaimsPaid += amount;
        emit PendingClaimsChanged(pendingClaimsLiability);
        _ensureLiquidity(amount);
        IERC20(asset()).safeTransfer(landlord, amount);
        emit ClaimPayout(landlord, amount);
    }

    /// @notice Records a tenant repayment.
    function receiveRepayment(uint256 amount) external onlyRole(CLAIM_MANAGER_ROLE) {
        totalRecoveries += amount;
        emit RepaymentReceived(amount);
    }

    /// @notice First-loss covers a default, up to its balance.
    function coverDefault(uint256 amount) external onlyRole(CLAIM_MANAGER_ROLE) returns (uint256 covered) {
        covered = Math.min(amount, firstLossBalance);
        if (covered > 0) {
            firstLossBalance -= covered;
            totalFirstLossCovered += covered;
        }
        emit FirstLossUsed(covered, firstLossBalance);
    }

    /// @notice Records USDG partner rewards.
    function receiveRewards(uint256 amount) external onlyRole(REWARDS_ROLE) {
        totalRewardsReceived += amount;
        emit RewardsReceived(amount);
    }

    // Yield

    /// @notice Moves idle USDG to or from the adapter. Permissionless.
    function rebalance() external nonReentrant {
        IYieldAdapter adapter = yieldAdapter;
        if (address(adapter) == address(0)) return;
        uint256 idle = idleAssets();
        uint256 target =
            Math.mulDiv(totalAssets(), liquidityTargetBps, BPS) + firstLossBalance + pendingClaimsLiability;
        if (idle > target) {
            uint256 amount = idle - target;
            IERC20(asset()).forceApprove(address(adapter), amount);
            adapter.deposit(amount);
        } else if (idle < target) {
            uint256 want = target - idle;
            uint256 available = adapter.totalValue();
            uint256 amount = want > available ? available : want;
            if (amount > 0) adapter.withdraw(amount);
        }
        emit Rebalanced(idleAssets(), adapter.totalValue());
    }

    /// @notice Switches adapter, withdrawing from the old one.
    function setYieldAdapter(IYieldAdapter newAdapter) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (address(newAdapter) != address(0) && newAdapter.asset() != asset()) revert ParamOutOfBounds();
        IYieldAdapter old = yieldAdapter;
        if (address(old) != address(0)) {
            uint256 value = old.totalValue();
            if (value > 0) old.withdraw(value);
        }
        yieldAdapter = newAdapter;
        emit YieldAdapterUpdated(address(newAdapter));
    }

    // Admin

    function setMinReserveBps(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps < MIN_RESERVE_FLOOR_BPS || bps > BPS) revert ParamOutOfBounds();
        minReserveBps = bps;
        emit ParamsUpdated("minReserveBps", bps);
    }

    function setLiquidityTargetBps(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps < 500 || bps > BPS) revert ParamOutOfBounds();
        liquidityTargetBps = bps;
        emit ParamsUpdated("liquidityTargetBps", bps);
    }

    function setFirstLossCapBps(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_FIRST_LOSS_CAP_BPS) revert ParamOutOfBounds();
        firstLossCapBps = bps;
        emit ParamsUpdated("firstLossCapBps", bps);
    }

    function setMaxLandlordShareBps(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps < 100 || bps > BPS) revert ParamOutOfBounds();
        maxLandlordShareBps = bps;
        emit ParamsUpdated("maxLandlordShareBps", bps);
    }

    function setConcentrationFloor(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (amount > 1_000_000 * _unit) revert ParamOutOfBounds();
        concentrationFloor = amount;
        emit ParamsUpdated("concentrationFloor", amount);
    }

    /// @notice Pauses deposits and new coverage.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // Internal

    function _checkReserveAfterWithdraw(uint256 assets) private view {
        uint256 current = totalAssets();
        uint256 afterWithdraw = current > assets ? current - assets : 0;
        uint256 required = requiredReserve(activeCoverage);
        if (afterWithdraw < required) revert ReserveTooLow(afterWithdraw, required);
    }

    function _ensureLiquidity(uint256 amount) private {
        uint256 idle = idleAssets();
        if (idle < amount && address(yieldAdapter) != address(0)) {
            yieldAdapter.withdraw(amount - idle);
            idle = idleAssets();
        }
        if (idle < amount) revert InsufficientLiquidity(idle, amount);
    }
}
