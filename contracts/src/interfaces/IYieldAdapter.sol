// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Where the pool parks idle USDG (tokenized T-bills). Swapping the yield source
///         (Mock vault on testnet, BENJI / BUIDL in production) only requires a new adapter.
interface IYieldAdapter {
    function asset() external view returns (address);

    /// @notice Pulls `amount` of the asset from the pool (caller) and invests it.
    function deposit(uint256 amount) external;

    /// @notice Redeems `amount` of the asset and sends it to the pool. Returns the amount sent.
    function withdraw(uint256 amount) external returns (uint256 withdrawn);

    /// @notice Current value of the pool's position, in asset units.
    function totalValue() external view returns (uint256);
}
