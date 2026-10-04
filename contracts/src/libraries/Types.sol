// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

enum PolicyStatus {
    Invited,
    Active,
    Lapsed,
    Ended,
    Claimed,
    Closed,
    Cancelled
}

enum ClaimStatus {
    None,
    Filed,
    Accepted,
    Disputed,
    Approved,
    PartiallyApproved,
    Rejected,
    Paid
}

enum ClaimType {
    Damage,
    UnpaidRent,
    Other
}

enum RiskTier {
    A,
    B,
    C
}

struct Policy {
    uint256 id;
    address landlord;
    address tenant; // zero = open invite; set on accept
    string propertyRef; // e.g. "Unit 12B"
    uint128 monthlyRent; // informational
    uint128 coverage; // = deposit amount guaranteed
    uint128 monthlyPremium; // set at accept
    uint64 startTime;
    uint64 endTime;
    uint64 nextPremiumDue; // 0 once every period is paid
    uint64 lapsedAt; // 0 unless the policy lapsed
    uint32 periodsPaid;
    uint32 totalPeriods; // 6 or 12
    RiskTier tier;
    PolicyStatus status;
    string checkInCid; // IPFS manifest
    bytes32 checkInHash; // manifest hash
    string tenantCheckInCid; // optional tenant move-in notes
    bytes32 tenantCheckInHash;
}

struct Claim {
    uint256 policyId;
    ClaimType claimType;
    uint128 amountClaimed;
    uint128 amountApproved;
    uint64 filedAt;
    uint64 responseDeadline; // tenant reply deadline
    uint64 arbiterDeadline;
    ClaimStatus status;
    string evidenceCid; // IPFS manifest
    bytes32 evidenceHash;
    string landlordNote;
    string tenantNote;
    string arbiterReason;
}

struct Debt {
    uint128 principal; // approved claim + missed premium + dispute fee
    uint128 repaid;
    uint64 nextInstallmentDue; // 0 once fully repaid
    uint32 installments;
    bool defaulted;
}

/// @notice Protocol durations, fixed at deploy.
struct TimeConfig {
    uint64 premiumPeriod;
    uint64 gracePeriod;
    uint64 checkInWindow;
    uint64 claimWindow;
    uint64 responseWindow;
    uint64 arbiterWindow;
    uint64 installmentPeriod;
    uint32 debtInstallments;
}

library TimeProfiles {
    /// @notice Production durations.
    function prod() internal pure returns (TimeConfig memory) {
        return TimeConfig({
            premiumPeriod: 30 days,
            gracePeriod: 7 days,
            checkInWindow: 3 days,
            claimWindow: 7 days,
            responseWindow: 3 days,
            arbiterWindow: 5 days,
            installmentPeriod: 30 days,
            debtInstallments: 6
        });
    }

    /// @notice Demo durations: 1 minute = 1 month.
    function demo() internal pure returns (TimeConfig memory) {
        return TimeConfig({
            premiumPeriod: 1 minutes,
            gracePeriod: 1 minutes,
            checkInWindow: 3 minutes,
            claimWindow: 5 minutes,
            responseWindow: 3 minutes,
            arbiterWindow: 5 minutes,
            installmentPeriod: 1 minutes,
            debtInstallments: 6
        });
    }
}
