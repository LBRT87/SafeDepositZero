// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Shared custom errors.
error ReserveTooLow(uint256 current, uint256 required);
error ConcentrationTooHigh(uint256 current, uint256 limit);
error CoverageTooHigh();
error TenantBlocked();
error NotLandlord();
error NotTenant();
error InvalidStatus(uint8 expected, uint8 actual);
error WindowClosed();
error WindowNotOpen();
error AmountExceedsCoverage();
error ClaimExists();
error InvalidTerm();
error InvalidTier();
error ZeroAmount();
error InsufficientLiquidity(uint256 available, uint256 required);
error ParamOutOfBounds();

// Extra errors
error ZeroAddress();
error InvalidPeriods();
error PremiumNotDue();
error StringTooLong();
error ReasonRequired();
error AmountExceedsClaim();
error NotAssignedArbiter();
error NotOverdue();
error NothingOwed();
error AlreadyDefaulted();
error OnlyPool();
error PremiumsOutstanding();
error SameParty();
error NotRequestOwner();
error PoolUnderwater();
