// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IYieldAdapter} from "../interfaces/IYieldAdapter.sol";
import {MockTBillVault} from "./MockTBillVault.sol";
import {OnlyPool, ZeroAddress, ZeroAmount} from "../libraries/Errors.sol";

/// @title TBillAdapter
/// @notice Pool adapter for a tokenized T-bill vault.
contract TBillAdapter is IYieldAdapter {
    using SafeERC20 for IERC20;

    IERC20 private immutable _asset;
    MockTBillVault public immutable vault;
    address public immutable pool;

    modifier onlyPool() {
        if (msg.sender != pool) revert OnlyPool();
        _;
    }

    constructor(MockTBillVault vault_, address pool_) {
        if (address(vault_) == address(0) || pool_ == address(0)) revert ZeroAddress();
        vault = vault_;
        pool = pool_;
        _asset = vault_.asset();
        _asset.forceApprove(address(vault_), type(uint256).max);
    }

    function asset() external view returns (address) {
        return address(_asset);
    }

    function deposit(uint256 amount) external onlyPool {
        if (amount == 0) revert ZeroAmount();
        _asset.safeTransferFrom(pool, address(this), amount);
        vault.deposit(amount);
    }

    function withdraw(uint256 amount) external onlyPool returns (uint256 withdrawn) {
        uint256 value = vault.valueOf(address(this));
        withdrawn = amount > value ? value : amount;
        if (withdrawn == 0) return 0;
        vault.withdraw(withdrawn);
        _asset.safeTransfer(pool, withdrawn);
    }

    function totalValue() external view returns (uint256) {
        return vault.valueOf(address(this));
    }
}
