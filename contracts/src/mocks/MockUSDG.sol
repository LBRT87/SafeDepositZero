// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet USDG with public mint. Never deploy to mainnet.
contract MockUSDG is ERC20 {
    uint256 public constant MAX_MINT = 100_000e6;

    constructor() ERC20("Mock Global Dollar", "USDG") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Faucet, capped per call.
    function mint(address to, uint256 amount) external {
        require(amount <= MAX_MINT, "MockUSDG: max 100k per mint");
        _mint(to, amount);
    }
}
