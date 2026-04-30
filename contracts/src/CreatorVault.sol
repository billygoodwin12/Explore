// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title CreatorVault — v0.1 skeleton
/// @notice Single-creator vault that holds USDC and mints ERC-4626 shares.
///         No orders, no Core bridging, no fees. Just deposit/withdraw to
///         prove share-accounting works end-to-end on testnet. CoreWriter
///         routing and builder-fee plumbing land in Phase 1.5.
contract CreatorVault is ERC4626 {
    /// @notice Address allowed to call vault-management actions in later
    ///         phases (placeOrder, closePosition, etc). Stored now so the
    ///         interface is stable; unused in v0.1.
    address public immutable creator;

    constructor(IERC20 usdc, address creator_, string memory name_, string memory symbol_)
        ERC4626(usdc)
        ERC20(name_, symbol_)
    {
        creator = creator_;
    }
}
