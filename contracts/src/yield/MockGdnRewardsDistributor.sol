// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {GuaranteePool} from "../GuaranteePool.sol";
import {ParamOutOfBounds, ZeroAddress} from "../libraries/Errors.sol";

/// @title MockGdnRewardsDistributor
/// @notice Simulated USDG partner rewards on idle pool cash.
contract MockGdnRewardsDistributor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_APR_BPS = 2_000;
    uint256 public constant MAX_TIME_MULTIPLIER = 100_000;

    IERC20 public immutable usdg;
    GuaranteePool public immutable pool;
    uint256 public gdnAprBps = 300; // 3.0%
    uint256 public timeMultiplier = 1;
    uint64 public lastDistribution;
    uint256 public totalDistributed;

    event RewardsDistributed(uint256 amount, uint256 idleBase, uint256 elapsed);
    event RewardsFunded(uint256 amount);
    event AprUpdated(uint256 aprBps);
    event TimeMultiplierUpdated(uint256 timeMultiplier);

    constructor(IERC20 usdg_, GuaranteePool pool_, address owner_) Ownable(owner_) {
        if (address(usdg_) == address(0) || address(pool_) == address(0)) revert ZeroAddress();
        usdg = usdg_;
        pool = pool_;
        lastDistribution = uint64(block.timestamp);
    }

    /// @notice Accrued reward, capped by balance.
    function pendingRewards() public view returns (uint256) {
        uint256 elapsed = block.timestamp - lastDistribution;
        uint256 accrued = Math.mulDiv(pool.idleAssets(), gdnAprBps * elapsed * timeMultiplier, 365 days * 10_000);
        return Math.min(accrued, usdg.balanceOf(address(this)));
    }

    /// @notice Pays accrued rewards into the pool. Permissionless.
    function distributeRewards() external nonReentrant returns (uint256 amount) {
        uint256 elapsed = block.timestamp - lastDistribution;
        uint256 idle = pool.idleAssets();
        amount = pendingRewards();
        lastDistribution = uint64(block.timestamp);
        emit RewardsDistributed(amount, idle, elapsed);
        if (amount == 0) return 0;
        totalDistributed += amount;
        usdg.safeTransfer(address(pool), amount);
        pool.receiveRewards(amount);
    }

    /// @notice Funds simulated rewards.
    function fund(uint256 amount) external {
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardsFunded(amount);
    }

    function setAprBps(uint256 newApr) external onlyOwner {
        if (newApr > MAX_APR_BPS) revert ParamOutOfBounds();
        gdnAprBps = newApr;
        emit AprUpdated(newApr);
    }

    /// @notice Demo speed-up.
    function setTimeMultiplier(uint256 newMultiplier) external onlyOwner {
        if (newMultiplier == 0 || newMultiplier > MAX_TIME_MULTIPLIER) revert ParamOutOfBounds();
        timeMultiplier = newMultiplier;
        emit TimeMultiplierUpdated(newMultiplier);
    }
}
