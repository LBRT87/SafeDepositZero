// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {GuaranteePool} from "./GuaranteePool.sol";
import {TenantRegistry} from "./TenantRegistry.sol";
import {IPremiumCalculator} from "./interfaces/IPremiumCalculator.sol";
import {Policy, PolicyStatus, RiskTier, TimeConfig} from "./libraries/Types.sol";
import "./libraries/Errors.sol";

/// @title PolicyManager
/// @notice Lease invites and the policy lifecycle (SPEC §6, §7.5):
///
///   Invited ──accept + 1st premium──► Active ──end time, all paid──► Ended ──claim filed──► Claimed ──► Closed
///      │                                │                             └──window passes, no claim──► Closed
///      └──landlord cancels──► Cancelled └──premium unpaid past due + grace──► Lapsed ──(claim or window)──► …
///
/// The tenant's tier comes from the TenantRegistry at acceptance. Every premium is split:
///   75% to the pool · 10% to the first-loss reserve (until its cap) · 15% (25% once capped) to the treasury.
/// A lapsed policy keeps its coverage for damage before the lapse; the landlord gets a claim window from then.
/// Time-based transitions (`markLapsed`, `endLease`, `closeIfNoClaim`) are permissionless keeper calls.
contract PolicyManager is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant CLAIM_MANAGER_ROLE = keccak256("CLAIM_MANAGER_ROLE");

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 4_000;
    uint256 public constant MAX_PROPERTY_REF_LENGTH = 64;
    uint256 public constant MAX_CID_LENGTH = 100;

    IERC20 public immutable usdg;
    GuaranteePool public immutable pool;
    TenantRegistry public immutable registry;
    uint256 private immutable _unit; // 1 USDG in base units

    IPremiumCalculator public calculator;
    address public treasury;
    uint256 public protocolFeeBps = 2_500;
    uint256 public firstLossShareBps = 4_000; // share of the protocol fee sent to the first-loss reserve
    uint256 public maxCoveragePerPolicy;

    TimeConfig private _time;

    uint256 public policyCount;
    mapping(uint256 => Policy) private _policies;

    uint256 public totalPremiumsCollected;
    uint256 public totalProtocolFees;

    event InviteCreated(
        uint256 indexed policyId,
        address indexed landlord,
        address indexed tenant,
        string propertyRef,
        uint256 monthlyRent,
        uint256 coverage,
        uint32 totalPeriods,
        string checkInCid,
        bytes32 checkInHash
    );
    event InviteCancelled(uint256 indexed policyId);
    event PolicyActivated(
        uint256 indexed policyId, address indexed tenant, RiskTier tier, uint256 monthlyPremium, uint64 endTime
    );
    event CheckInEvidenceAdded(uint256 indexed policyId, string cid, bytes32 hash);
    event PremiumPaid(
        uint256 indexed policyId,
        uint256 amount,
        uint256 toPool,
        uint256 toFirstLoss,
        uint256 toTreasury,
        uint32 periodsPaid
    );
    event PolicyLapsed(uint256 indexed policyId, uint64 claimWindowEnd);
    event LeaseEnded(uint256 indexed policyId, uint64 claimWindowEnd);
    event PolicyClaimed(uint256 indexed policyId);
    event PolicyClosed(uint256 indexed policyId, bool clean);
    event ParamsUpdated(bytes32 indexed key, uint256 value);
    event TreasuryUpdated(address treasury);
    event CalculatorUpdated(address calculator);

    constructor(
        IERC20 usdg_,
        GuaranteePool pool_,
        TenantRegistry registry_,
        IPremiumCalculator calculator_,
        address treasury_,
        address admin,
        TimeConfig memory time_
    ) {
        if (
            address(usdg_) == address(0) || address(pool_) == address(0) || address(registry_) == address(0)
                || address(calculator_) == address(0) || treasury_ == address(0) || admin == address(0)
        ) revert ZeroAddress();
        if (
            time_.premiumPeriod == 0 || time_.debtInstallments == 0 || time_.claimWindow == 0
                || time_.responseWindow == 0 || time_.installmentPeriod == 0
        ) revert ParamOutOfBounds();

        usdg = usdg_;
        pool = pool_;
        registry = registry_;
        calculator = calculator_;
        treasury = treasury_;
        _time = time_;
        _unit = 10 ** IERC20Metadata(address(usdg_)).decimals();
        maxCoveragePerPolicy = 10_000 * _unit;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ───────────────────────────── Landlord ─────────────────────────────

    /// @notice Creates a lease invite. `tenant` may be zero for a shareable invite link.
    /// @param checkInCid  IPFS CID of the landlord's check-in photo manifest.
    /// @param checkInHash keccak256 of the manifest bytes.
    function createInvite(
        address tenant,
        string calldata propertyRef,
        uint128 monthlyRent,
        uint128 coverage,
        uint32 totalPeriods,
        string calldata checkInCid,
        bytes32 checkInHash
    ) external whenNotPaused returns (uint256 policyId) {
        if (coverage == 0) revert ZeroAmount();
        if (coverage > maxCoveragePerPolicy) revert CoverageTooHigh();
        if (totalPeriods != 6 && totalPeriods != 12) revert InvalidTerm();
        if (bytes(propertyRef).length == 0 || bytes(propertyRef).length > MAX_PROPERTY_REF_LENGTH) {
            revert StringTooLong();
        }
        if (bytes(checkInCid).length > MAX_CID_LENGTH) revert StringTooLong();
        if (tenant == msg.sender) revert SameParty();
        // Fail early with a clear reason; the binding checks run again at acceptance.
        _checkCapacity(msg.sender, coverage);

        policyId = ++policyCount;
        Policy storage p = _policies[policyId];
        p.id = policyId;
        p.landlord = msg.sender;
        p.tenant = tenant;
        p.propertyRef = propertyRef;
        p.monthlyRent = monthlyRent;
        p.coverage = coverage;
        p.totalPeriods = totalPeriods;
        p.checkInCid = checkInCid;
        p.checkInHash = checkInHash;
        p.status = PolicyStatus.Invited;

        emit InviteCreated(
            policyId, msg.sender, tenant, propertyRef, monthlyRent, coverage, totalPeriods, checkInCid, checkInHash
        );
    }

    /// @notice Withdraws an invite nobody has accepted yet.
    function cancelInvite(uint256 policyId) external {
        Policy storage p = _policies[policyId];
        if (p.landlord != msg.sender) revert NotLandlord();
        _requireStatus(p, PolicyStatus.Invited);
        p.status = PolicyStatus.Cancelled;
        emit InviteCancelled(policyId);
    }

    // ───────────────────────────── Tenant ─────────────────────────────

    /// @notice Accepts an invite and pays the first premium. The tier comes from the tenant's rental history.
    /// @dev Requires a USDG allowance of `quoteFor(policyId, msg.sender)` to this contract.
    function acceptInvite(uint256 policyId) external nonReentrant whenNotPaused {
        Policy storage p = _policies[policyId];
        _requireStatus(p, PolicyStatus.Invited);
        if (p.tenant == address(0)) {
            if (msg.sender == p.landlord) revert SameParty();
            p.tenant = msg.sender;
        } else if (p.tenant != msg.sender) {
            revert NotTenant();
        }
        if (registry.isBlocked(msg.sender)) revert TenantBlocked();

        RiskTier tier = registry.tierOf(msg.sender);
        (uint256 monthlyPremium,) = calculator.quote(p.coverage, p.totalPeriods, uint8(tier));

        uint64 start = uint64(block.timestamp);
        uint64 end = start + uint64(p.totalPeriods) * _time.premiumPeriod;
        p.tier = tier;
        p.monthlyPremium = SafeCast.toUint128(monthlyPremium);
        p.startTime = start;
        p.endTime = end;
        p.periodsPaid = 1;
        p.nextPremiumDue = start + _time.premiumPeriod;
        p.status = PolicyStatus.Active;

        emit PolicyActivated(policyId, msg.sender, tier, monthlyPremium, end);

        pool.increaseCoverage(p.landlord, p.coverage); // reserve + concentration checks
        _collectPremium(policyId, monthlyPremium, 1);
    }

    /// @notice The tenant adds their own move-in notes and photos within the check-in window, to flag
    ///         damage that was already there. Pre-existing damage is not claimable.
    function addCheckInEvidence(uint256 policyId, string calldata cid, bytes32 hash) external {
        Policy storage p = _policies[policyId];
        _requireStatus(p, PolicyStatus.Active);
        if (p.tenant != msg.sender) revert NotTenant();
        if (block.timestamp > uint256(p.startTime) + _time.checkInWindow) revert WindowClosed();
        if (bytes(cid).length == 0 || bytes(cid).length > MAX_CID_LENGTH) revert StringTooLong();
        p.tenantCheckInCid = cid;
        p.tenantCheckInHash = hash;
        emit CheckInEvidenceAdded(policyId, cid, hash);
    }

    /// @notice Pays the next period's premium. Anyone may pay on the tenant's behalf; paying ahead is allowed.
    function payPremium(uint256 policyId) external nonReentrant {
        Policy storage p = _policies[policyId];
        _requireStatus(p, PolicyStatus.Active);
        if (p.periodsPaid >= p.totalPeriods) revert PremiumNotDue();
        if (block.timestamp > uint256(p.nextPremiumDue) + _time.gracePeriod) revert WindowClosed();

        uint32 period = ++p.periodsPaid;
        p.nextPremiumDue = period < p.totalPeriods ? p.startTime + uint64(period) * _time.premiumPeriod : 0;

        _collectPremium(policyId, p.monthlyPremium, period);
    }

    // ─────────────────────── Keeper (permissionless) ───────────────────────

    /// @notice Lapses a policy whose premium is unpaid past due + grace. Coverage stays for damage before the
    ///         lapse, and the landlord's claim window opens now.
    function markLapsed(uint256 policyId) external {
        Policy storage p = _policies[policyId];
        _requireStatus(p, PolicyStatus.Active);
        if (p.periodsPaid >= p.totalPeriods) revert PremiumNotDue();
        if (block.timestamp <= uint256(p.nextPremiumDue) + _time.gracePeriod) revert WindowNotOpen();

        p.status = PolicyStatus.Lapsed;
        p.lapsedAt = uint64(block.timestamp);
        emit PolicyLapsed(policyId, p.lapsedAt + _time.claimWindow);
    }

    /// @notice Ends a fully paid lease once its end time has passed. Opens the claim window.
    function endLease(uint256 policyId) external {
        Policy storage p = _policies[policyId];
        _requireStatus(p, PolicyStatus.Active);
        if (block.timestamp < p.endTime) revert WindowNotOpen();
        if (p.periodsPaid < p.totalPeriods) revert PremiumsOutstanding();
        _end(p);
    }

    /// @notice Closes an ended or lapsed policy after its claim window passes without a claim. Releases the
    ///         coverage. A lease that ended without a lapse counts as a clean rental for the tenant.
    function closeIfNoClaim(uint256 policyId) external {
        Policy storage p = _policies[policyId];
        _autoEnd(p);
        if (p.status != PolicyStatus.Ended && p.status != PolicyStatus.Lapsed) {
            revert InvalidStatus(uint8(PolicyStatus.Ended), uint8(p.status));
        }
        if (block.timestamp <= claimWindowEnd(policyId)) revert WindowNotOpen();
        _close(p, p.lapsedAt == 0);
    }

    // ─────────────────────── ClaimManager hooks ───────────────────────

    /// @notice Moves an ended or lapsed policy into Claimed. Enforces the claim window.
    function onClaimFiled(uint256 policyId) external onlyRole(CLAIM_MANAGER_ROLE) {
        Policy storage p = _policies[policyId];
        _autoEnd(p);
        if (p.status != PolicyStatus.Ended && p.status != PolicyStatus.Lapsed) {
            revert InvalidStatus(uint8(PolicyStatus.Ended), uint8(p.status));
        }
        if (block.timestamp > claimWindowEnd(policyId)) revert WindowClosed();
        p.status = PolicyStatus.Claimed;
        emit PolicyClaimed(policyId);
    }

    /// @notice Closes a claimed policy once its claim is paid or rejected. Releases its coverage.
    /// @param clean True when the claim was rejected in full, so the tenant keeps a clean record.
    function onClaimSettled(uint256 policyId, bool clean) external onlyRole(CLAIM_MANAGER_ROLE) {
        Policy storage p = _policies[policyId];
        _requireStatus(p, PolicyStatus.Claimed);
        _close(p, clean && p.lapsedAt == 0);
    }

    // ───────────────────────────── Views ─────────────────────────────

    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        return _policies[policyId];
    }

    function timeConfig() external view returns (TimeConfig memory) {
        return _time;
    }

    /// @notice Claim deadline: the claim window after the lease end, or after the lapse for a lapsed policy.
    function claimWindowEnd(uint256 policyId) public view returns (uint256) {
        Policy storage p = _policies[policyId];
        uint256 from = p.lapsedAt != 0 ? p.lapsedAt : p.endTime;
        return from + _time.claimWindow;
    }

    function quote(uint256 coverage, uint32 totalPeriods, RiskTier tier)
        external
        view
        returns (uint256 monthlyPremium, uint256 annualPremium)
    {
        return calculator.quote(coverage, totalPeriods, uint8(tier));
    }

    /// @notice What `tenant` would pay per month on this invite, and whether they can accept it at all.
    function quoteFor(uint256 policyId, address tenant)
        external
        view
        returns (uint256 monthlyPremium, RiskTier tier, bool blocked)
    {
        Policy storage p = _policies[policyId];
        tier = registry.tierOf(tenant);
        blocked = registry.isBlocked(tenant);
        (monthlyPremium,) = calculator.quote(p.coverage, p.totalPeriods, uint8(tier));
    }

    /// @notice Splits a premium into (toPool, toFirstLoss, toTreasury).
    function splitPremium(uint256 amount)
        public
        view
        returns (uint256 toPool, uint256 toFirstLoss, uint256 toTreasury)
    {
        uint256 fee = (amount * protocolFeeBps) / BPS;
        toPool = amount - fee;
        toFirstLoss = Math.min((fee * firstLossShareBps) / BPS, pool.firstLossRoom());
        toTreasury = fee - toFirstLoss;
    }

    // ───────────────────────────── Admin ─────────────────────────────

    function setProtocolFeeBps(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_PROTOCOL_FEE_BPS) revert ParamOutOfBounds();
        protocolFeeBps = bps;
        emit ParamsUpdated("protocolFeeBps", bps);
    }

    function setFirstLossShareBps(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > BPS) revert ParamOutOfBounds();
        firstLossShareBps = bps;
        emit ParamsUpdated("firstLossShareBps", bps);
    }

    function setMaxCoveragePerPolicy(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (amount == 0 || amount > 100_000 * _unit) revert ParamOutOfBounds();
        maxCoveragePerPolicy = amount;
        emit ParamsUpdated("maxCoveragePerPolicy", amount);
    }

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /// @notice Swap the pricing engine (e.g. Stylus ↔ Solidity). Existing policies keep their premium.
    function setCalculator(IPremiumCalculator newCalculator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(newCalculator) == address(0)) revert ZeroAddress();
        calculator = newCalculator;
        emit CalculatorUpdated(address(newCalculator));
    }

    /// @notice Pauses new invites and acceptances. Premiums, claims and keeper calls keep working.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ───────────────────────────── Internal ─────────────────────────────

    function _checkCapacity(address landlord, uint256 coverage) private view {
        uint256 required = pool.requiredReserve(pool.activeCoverage() + coverage);
        uint256 current = pool.totalAssets();
        if (current < required) revert ReserveTooLow(current, required);
        uint256 landlordCoverage = pool.coverageByLandlord(landlord) + coverage;
        uint256 limit = pool.landlordLimit();
        if (landlordCoverage > limit) revert ConcentrationTooHigh(landlordCoverage, limit);
    }

    function _collectPremium(uint256 policyId, uint256 amount, uint32 period) private {
        (uint256 toPool, uint256 toFirstLoss, uint256 toTreasury) = splitPremium(amount);
        totalPremiumsCollected += amount;
        totalProtocolFees += toTreasury + toFirstLoss;
        emit PremiumPaid(policyId, amount, toPool, toFirstLoss, toTreasury, period);

        usdg.safeTransferFrom(msg.sender, address(pool), toPool + toFirstLoss);
        if (toTreasury > 0) usdg.safeTransferFrom(msg.sender, treasury, toTreasury);
        pool.receivePremium(toPool, toFirstLoss);
    }

    /// @dev A fully paid lease past its end time is treated as Ended even if no keeper called `endLease`.
    function _autoEnd(Policy storage p) private {
        if (p.status == PolicyStatus.Active && block.timestamp >= p.endTime && p.periodsPaid >= p.totalPeriods) {
            _end(p);
        }
    }

    function _end(Policy storage p) private {
        p.status = PolicyStatus.Ended;
        emit LeaseEnded(p.id, p.endTime + _time.claimWindow);
    }

    function _close(Policy storage p, bool clean) private {
        p.status = PolicyStatus.Closed;
        emit PolicyClosed(p.id, clean);
        pool.decreaseCoverage(p.landlord, p.coverage);
        if (clean) registry.recordClean(p.tenant);
    }

    function _requireStatus(Policy storage p, PolicyStatus expected) private view {
        if (p.status != expected || p.id == 0) revert InvalidStatus(uint8(expected), uint8(p.status));
    }
}
