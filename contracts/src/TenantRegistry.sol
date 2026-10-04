// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {RiskTier} from "./libraries/Types.sol";
import {ZeroAddress} from "./libraries/Errors.sol";

/// @title TenantRegistry
/// @notice On-chain rental history and risk tier per tenant.
contract TenantRegistry is AccessControl {
    bytes32 public constant WRITER_ROLE = keccak256("WRITER_ROLE");

    struct Record {
        uint32 cleanCompleted;
        uint32 claimsPaid;
        uint32 openDebts;
        bool defaulted;
    }

    mapping(address => Record) private _records;

    event CleanRecorded(address indexed tenant, uint32 cleanCompleted);
    event ClaimPaidRecorded(address indexed tenant, uint32 claimsPaid, uint32 openDebts);
    event DebtClosedRecorded(address indexed tenant, uint32 openDebts);
    event DefaultRecorded(address indexed tenant);

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // Writers

    /// @notice Lease closed clean.
    function recordClean(address tenant) external onlyRole(WRITER_ROLE) {
        uint32 n = ++_records[tenant].cleanCompleted;
        emit CleanRecorded(tenant, n);
    }

    /// @notice Claim paid; opens a debt.
    function recordClaimPaid(address tenant) external onlyRole(WRITER_ROLE) {
        Record storage r = _records[tenant];
        r.claimsPaid += 1;
        r.openDebts += 1;
        emit ClaimPaidRecorded(tenant, r.claimsPaid, r.openDebts);
    }

    /// @notice Debt repaid in full.
    function recordDebtClosed(address tenant) external onlyRole(WRITER_ROLE) {
        Record storage r = _records[tenant];
        if (r.openDebts > 0) r.openDebts -= 1;
        emit DebtClosedRecorded(tenant, r.openDebts);
    }

    /// @notice Debt defaulted; tenant blocked.
    function recordDefault(address tenant) external onlyRole(WRITER_ROLE) {
        _records[tenant].defaulted = true;
        emit DefaultRecorded(tenant);
    }

    // Views

    function recordOf(address tenant) external view returns (Record memory) {
        return _records[tenant];
    }

    function isBlocked(address tenant) public view returns (bool) {
        Record memory r = _records[tenant];
        return r.defaulted || r.openDebts > 0;
    }

    /// @notice Pricing tier. Check `isBlocked` first.
    function tierOf(address tenant) external view returns (RiskTier) {
        Record memory r = _records[tenant];
        if (r.claimsPaid > 0) return RiskTier.C;
        if (r.cleanCompleted > 0) return RiskTier.A;
        return RiskTier.B;
    }
}
