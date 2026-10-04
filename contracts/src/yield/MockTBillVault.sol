// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ZeroAmount, ParamOutOfBounds, InsufficientLiquidity} from "../libraries/Errors.sol";

/// @title MockTBillVault
/// @notice Simulated tokenized T-bill fund (simple interest).
contract MockTBillVault is Ownable {
    using SafeERC20 for IERC20;

    struct Position {
        uint256 principal; // incl. accrued interest
        uint64 lastAccrual;
    }

    uint256 public constant MAX_TIME_MULTIPLIER = 100_000;
    uint256 public constant MAX_APR_BPS = 2_000;

    IERC20 public immutable asset;
    uint256 public aprBps = 340; // 3.4%
    uint256 public timeMultiplier = 1;
    uint256 public totalPrincipal;

    mapping(address => Position) public positions;

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event YieldReserveFunded(uint256 amount);
    event AprUpdated(uint256 aprBps);
    event TimeMultiplierUpdated(uint256 timeMultiplier);

    constructor(IERC20 asset_, address owner_) Ownable(owner_) {
        asset = asset_;
    }

    function valueOf(address account) public view returns (uint256) {
        Position memory p = positions[account];
        return p.principal + _accrued(p);
    }

    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        _crystallize(msg.sender);
        positions[msg.sender].principal += amount;
        totalPrincipal += amount;
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        _crystallize(msg.sender);
        Position storage p = positions[msg.sender];
        if (amount > p.principal) revert InsufficientLiquidity(p.principal, amount);
        p.principal -= amount;
        totalPrincipal = totalPrincipal > amount ? totalPrincipal - amount : 0;
        uint256 bal = asset.balanceOf(address(this));
        if (amount > bal) revert InsufficientLiquidity(bal, amount);
        asset.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Funds simulated interest.
    function fundYieldReserve(uint256 amount) external {
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit YieldReserveFunded(amount);
    }

    function setAprBps(uint256 newApr) external onlyOwner {
        if (newApr > MAX_APR_BPS) revert ParamOutOfBounds();
        aprBps = newApr;
        emit AprUpdated(newApr);
    }

    /// @notice Demo speed-up.
    function setTimeMultiplier(uint256 newMultiplier) external onlyOwner {
        if (newMultiplier == 0 || newMultiplier > MAX_TIME_MULTIPLIER) revert ParamOutOfBounds();
        timeMultiplier = newMultiplier;
        emit TimeMultiplierUpdated(newMultiplier);
    }

    function _crystallize(address account) private {
        Position storage p = positions[account];
        uint256 interest = _accrued(p);
        if (interest > 0) {
            p.principal += interest;
            totalPrincipal += interest;
        }
        p.lastAccrual = uint64(block.timestamp);
    }

    function _accrued(Position memory p) private view returns (uint256) {
        if (p.principal == 0 || p.lastAccrual == 0) return 0;
        uint256 elapsed = block.timestamp - p.lastAccrual;
        return (p.principal * aprBps * elapsed * timeMultiplier) / (365 days * 10_000);
    }
}
