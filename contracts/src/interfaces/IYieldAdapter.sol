// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Yield source for the pool's idle USDG.
interface IYieldAdapter {
    function asset() external view returns (address);

    /// @notice Pulls `amount` from the pool and invests it.
    function deposit(uint256 amount) external;

    /// @notice Returns `amount` to the pool.
    function withdraw(uint256 amount) external returns (uint256 withdrawn);

    /// @notice Value of the pool's position.
    function totalValue() external view returns (uint256);
}
