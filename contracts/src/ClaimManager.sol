// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {GuaranteePool} from "./GuaranteePool.sol";
import {PolicyManager} from "./PolicyManager.sol";
import {TenantRegistry} from "./TenantRegistry.sol";
import {Policy, Claim, ClaimStatus, ClaimType, Debt, TimeConfig} from "./libraries/Types.sol";
import "./libraries/Errors.sol";

/// @title ClaimManager
/// @notice Move-out claims, disputes and tenant debt.
contract ClaimManager is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_DISPUTE_FEE_BPS = 1_000;
    uint256 public constant MAX_NOTE_LENGTH = 280;
    uint256 public constant MAX_CID_LENGTH = 100;

    IERC20 public immutable usdg;
    GuaranteePool public immutable pool;
    PolicyManager public immutable policyManager;
    TenantRegistry public immutable registry;
    uint256 private immutable _unit;

    uint256 public disputeFeeBps = 200; // 2% of the claimed amount
    uint256 public minDisputeFee; // 10 USDG

    uint256 public claimCount;
    mapping(uint256 => Claim) private _claims;
    mapping(uint256 => uint256) public claimIdByPolicy;
    mapping(uint256 => address) public assignedArbiter; // zero = any ARBITER_ROLE holder

    mapping(uint256 => Debt) private _debts; // by claimId
    mapping(uint256 => uint256) public disputeFeeOf; // fee part, paid after the pool
    mapping(uint256 => uint64) public debtStart;

    event ClaimFiled(
        uint256 indexed claimId,
        uint256 indexed policyId,
        ClaimType claimType,
        uint256 amount,
        string evidenceCid,
        bytes32 evidenceHash,
        uint64 responseDeadline
    );
    event ClaimAccepted(uint256 indexed claimId, bool automatic);
    event ClaimDisputed(uint256 indexed claimId, uint64 arbiterDeadline);
    event ClaimResolved(uint256 indexed claimId, ClaimStatus status, uint256 amountApproved, uint256 disputeFee);
    event ClaimPaid(uint256 indexed claimId, address indexed landlord, uint256 amount);
    event ArbiterReassigned(uint256 indexed claimId, address indexed arbiter, uint64 arbiterDeadline);
    event DebtCreated(
        uint256 indexed claimId, address indexed tenant, uint256 principal, uint256 missedPremium, uint32 installments
    );
    event DebtRepaid(uint256 indexed claimId, address indexed payer, uint256 amount, uint256 toPool, uint256 toTreasury);
    event DebtDefaulted(uint256 indexed claimId, address indexed tenant);
    event DefaultCovered(uint256 indexed policyId, uint256 covered, uint256 uncovered);
    event ParamsUpdated(bytes32 indexed key, uint256 value);

    constructor(
        IERC20 usdg_,
        GuaranteePool pool_,
        PolicyManager policyManager_,
        TenantRegistry registry_,
        address admin,
        address arbiter
    ) {
        if (
            address(usdg_) == address(0) || address(pool_) == address(0) || address(policyManager_) == address(0)
                || address(registry_) == address(0) || admin == address(0)
        ) revert ZeroAddress();
        usdg = usdg_;
        pool = pool_;
        policyManager = policyManager_;
        registry = registry_;
        _unit = 10 ** IERC20Metadata(address(usdg_)).decimals();
        minDisputeFee = 10 * _unit;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        if (arbiter != address(0)) _grantRole(ARBITER_ROLE, arbiter);
    }

    // Landlord

    /// @notice Files a claim within the claim window. One per policy.
    function fileClaim(
        uint256 policyId,
        ClaimType claimType,
        uint128 amount,
        string calldata evidenceCid,
        bytes32 evidenceHash,
        string calldata note
    ) external nonReentrant returns (uint256 claimId) {
        Policy memory p = policyManager.getPolicy(policyId);
        if (p.landlord != msg.sender) revert NotLandlord();
        if (claimIdByPolicy[policyId] != 0) revert ClaimExists();
        if (amount == 0) revert ZeroAmount();
        if (amount > p.coverage) revert AmountExceedsCoverage();
        if (bytes(note).length > MAX_NOTE_LENGTH || bytes(evidenceCid).length > MAX_CID_LENGTH) {
            revert StringTooLong();
        }

        policyManager.onClaimFiled(policyId); // checks status and window

        claimId = ++claimCount;
        Claim storage c = _claims[claimId];
        c.policyId = policyId;
        c.claimType = claimType;
        c.amountClaimed = amount;
        c.filedAt = uint64(block.timestamp);
        c.responseDeadline = uint64(block.timestamp) + policyManager.timeConfig().responseWindow;
        c.evidenceCid = evidenceCid;
        c.evidenceHash = evidenceHash;
        c.landlordNote = note;
        c.status = ClaimStatus.Filed;
        claimIdByPolicy[policyId] = claimId;

        emit ClaimFiled(claimId, policyId, claimType, amount, evidenceCid, evidenceHash, c.responseDeadline);
        pool.addPendingClaim(amount);
    }

    // Tenant

    function acceptClaim(uint256 claimId) external nonReentrant {
        Claim storage c = _claims[claimId];
        _requireStatus(c, ClaimStatus.Filed);
        if (_tenantOf(c) != msg.sender) revert NotTenant();
        if (block.timestamp > c.responseDeadline) revert WindowClosed();

        c.status = ClaimStatus.Accepted;
        emit ClaimAccepted(claimId, false);
        _payClaim(claimId, c.amountClaimed, 0);
    }

    function disputeClaim(uint256 claimId, string calldata note) external nonReentrant {
        Claim storage c = _claims[claimId];
        _requireStatus(c, ClaimStatus.Filed);
        if (_tenantOf(c) != msg.sender) revert NotTenant();
        if (block.timestamp > c.responseDeadline) revert WindowClosed();
        if (bytes(note).length == 0) revert ReasonRequired();
        if (bytes(note).length > MAX_NOTE_LENGTH) revert StringTooLong();

        c.status = ClaimStatus.Disputed;
        c.tenantNote = note;
        c.arbiterDeadline = uint64(block.timestamp) + policyManager.timeConfig().arbiterWindow;
        emit ClaimDisputed(claimId, c.arbiterDeadline);
    }

    /// @notice Repays tenant debt. Anyone may pay; overpayment is capped.
    function repay(uint256 claimId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Debt storage d = _debts[claimId];
        uint256 outstanding = uint256(d.principal) - d.repaid;
        if (outstanding == 0) revert NothingOwed();
        if (amount > outstanding) amount = outstanding;

        // Pool first, dispute fee last.
        uint256 poolRemaining = _poolOutstanding(claimId, d);
        uint256 toPool = Math.min(amount, poolRemaining);
        uint256 toTreasury = amount - toPool;

        d.repaid += SafeCast.toUint128(amount);
        d.nextInstallmentDue = _nextInstallmentDue(claimId, d);
        bool closed = d.repaid >= d.principal;

        emit DebtRepaid(claimId, msg.sender, amount, toPool, toTreasury);

        if (toPool > 0) {
            usdg.safeTransferFrom(msg.sender, address(pool), toPool);
            pool.receiveRepayment(toPool);
        }
        if (toTreasury > 0) usdg.safeTransferFrom(msg.sender, policyManager.treasury(), toTreasury);
        if (closed && !d.defaulted) registry.recordDebtClosed(_tenantOf(_claims[claimId]));
    }

    // Arbiter

    /// @notice Decides a dispute: 0 rejects, partial, or full (adds dispute fee).
    function resolveDispute(uint256 claimId, uint128 amountApproved, string calldata reason)
        external
        nonReentrant
        onlyRole(ARBITER_ROLE)
    {
        Claim storage c = _claims[claimId];
        _requireStatus(c, ClaimStatus.Disputed);
        address assigned = assignedArbiter[claimId];
        if (assigned != address(0) && assigned != msg.sender) revert NotAssignedArbiter();
        if (amountApproved > c.amountClaimed) revert AmountExceedsClaim();
        if (bytes(reason).length == 0) revert ReasonRequired();
        if (bytes(reason).length > MAX_NOTE_LENGTH) revert StringTooLong();

        c.arbiterReason = reason;
        pool.updatePendingClaim(c.amountClaimed, amountApproved);

        if (amountApproved == 0) {
            c.status = ClaimStatus.Rejected;
            emit ClaimResolved(claimId, ClaimStatus.Rejected, 0, 0);
            policyManager.onClaimSettled(c.policyId, true);
            return;
        }

        bool full = amountApproved == c.amountClaimed;
        uint256 fee = full ? disputeFee(c.amountClaimed) : 0;
        c.status = full ? ClaimStatus.Approved : ClaimStatus.PartiallyApproved;
        emit ClaimResolved(claimId, c.status, amountApproved, fee);
        _payClaim(claimId, amountApproved, fee);
    }

    // Keeper (permissionless)

    /// @notice Accepts a claim the tenant didn't answer in time.
    function autoAcceptClaim(uint256 claimId) external nonReentrant {
        Claim storage c = _claims[claimId];
        _requireStatus(c, ClaimStatus.Filed);
        if (block.timestamp <= c.responseDeadline) revert WindowNotOpen();

        c.status = ClaimStatus.Accepted;
        emit ClaimAccepted(claimId, true);
        _payClaim(claimId, c.amountClaimed, 0);
    }

    /// @notice Defaults an overdue debt; first-loss covers it and the tenant is blocked.
    function markDefault(uint256 claimId) external nonReentrant {
        Debt storage d = _debts[claimId];
        if (d.principal == 0 || d.repaid >= d.principal) revert NothingOwed();
        if (d.defaulted) revert AlreadyDefaulted();
        if (block.timestamp <= uint256(d.nextInstallmentDue) + policyManager.timeConfig().gracePeriod) {
            revert NotOverdue();
        }
        d.defaulted = true;
        Claim storage c = _claims[claimId];
        address tenant = _tenantOf(c);
        emit DebtDefaulted(claimId, tenant);

        uint256 outstanding = _poolOutstanding(claimId, d);
        uint256 covered = pool.coverDefault(outstanding);
        emit DefaultCovered(c.policyId, covered, outstanding - covered);
        registry.recordDefault(tenant);
    }

    // Admin

    /// @notice Reassigns a dispute after the arbiter deadline.
    function reassignArbiter(uint256 claimId, address newArbiter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Claim storage c = _claims[claimId];
        _requireStatus(c, ClaimStatus.Disputed);
        if (block.timestamp <= c.arbiterDeadline) revert WindowNotOpen();
        if (!hasRole(ARBITER_ROLE, newArbiter)) revert NotAssignedArbiter();
        assignedArbiter[claimId] = newArbiter;
        c.arbiterDeadline = uint64(block.timestamp) + policyManager.timeConfig().arbiterWindow;
        emit ArbiterReassigned(claimId, newArbiter, c.arbiterDeadline);
    }

    function setDisputeFeeBps(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_DISPUTE_FEE_BPS) revert ParamOutOfBounds();
        disputeFeeBps = bps;
        emit ParamsUpdated("disputeFeeBps", bps);
    }

    function setMinDisputeFee(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (amount > 100 * _unit) revert ParamOutOfBounds();
        minDisputeFee = amount;
        emit ParamsUpdated("minDisputeFee", amount);
    }

    // Views

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        return _claims[claimId];
    }

    function getDebt(uint256 claimId) external view returns (Debt memory) {
        return _debts[claimId];
    }

    /// @notice 2% of the claim, at least `minDisputeFee`.
    function disputeFee(uint256 claimedAmount) public view returns (uint256) {
        uint256 fee = (claimedAmount * disputeFeeBps) / BPS;
        return fee < minDisputeFee ? minDisputeFee : fee;
    }

    function installmentAmount(uint256 claimId) public view returns (uint256) {
        Debt memory d = _debts[claimId];
        if (d.installments == 0) return 0;
        return Math.ceilDiv(d.principal, d.installments);
    }

    // Internal

    function _payClaim(uint256 claimId, uint256 amount, uint256 fee) private {
        Claim storage c = _claims[claimId];
        Policy memory p = policyManager.getPolicy(c.policyId);
        TimeConfig memory t = policyManager.timeConfig();
        uint256 missedPremium = p.lapsedAt != 0 ? p.monthlyPremium : 0;

        c.amountApproved = SafeCast.toUint128(amount);
        c.status = ClaimStatus.Paid;

        uint256 principal = amount + missedPremium + fee;
        Debt storage d = _debts[claimId];
        d.principal = SafeCast.toUint128(principal);
        d.installments = t.debtInstallments;
        d.nextInstallmentDue = uint64(block.timestamp) + t.installmentPeriod;
        debtStart[claimId] = uint64(block.timestamp);
        disputeFeeOf[claimId] = fee;

        emit ClaimPaid(claimId, p.landlord, amount);
        emit DebtCreated(claimId, p.tenant, principal, missedPremium, t.debtInstallments);

        registry.recordClaimPaid(p.tenant);
        policyManager.onClaimSettled(c.policyId, false);
        pool.payClaim(p.landlord, amount);
    }

    /// @dev Debt owed to the pool, excluding the dispute fee.
    function _poolOutstanding(uint256 claimId, Debt storage d) private view returns (uint256) {
        uint256 poolPortion = uint256(d.principal) - disputeFeeOf[claimId];
        return poolPortion > d.repaid ? poolPortion - d.repaid : 0;
    }

    /// @dev Due date of the first unpaid installment.
    function _nextInstallmentDue(uint256 claimId, Debt storage d) private view returns (uint64) {
        if (d.repaid >= d.principal) return 0;
        uint256 per = Math.ceilDiv(d.principal, d.installments);
        uint256 covered = d.repaid / per; // installments fully paid
        return debtStart[claimId] + SafeCast.toUint64(covered + 1) * policyManager.timeConfig().installmentPeriod;
    }

    function _tenantOf(Claim storage c) private view returns (address) {
        return policyManager.getPolicy(c.policyId).tenant;
    }

    function _requireStatus(Claim storage c, ClaimStatus expected) private view {
        if (c.status != expected) revert InvalidStatus(uint8(expected), uint8(c.status));
    }
}
