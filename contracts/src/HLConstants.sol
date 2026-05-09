// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice HyperLiquid system contracts and CoreWriter action IDs.
///         Network-specific addresses (USDC, CoreDepositWallet) are passed
///         at construction so this library is network-agnostic.
library HLConstants {
    /// @notice CoreWriter precompile, identical on mainnet and testnet.
    ///         Accepts raw bytes shaped as:
    ///           1B  version  (always 0x01)
    ///           3B  actionId (big-endian uint24)
    ///           NB  abi.encoded payload
    address internal constant CORE_WRITER = 0x3333333333333333333333333333333333333333;

    // ─── CoreWriter action IDs ──────────────────────────────────────
    uint24 internal constant ACTION_LIMIT_ORDER = 1;
    uint24 internal constant ACTION_SPOT_SEND = 6;
    uint24 internal constant ACTION_USD_CLASS_TRANSFER = 7;
    uint24 internal constant ACTION_ADD_API_WALLET = 9;
    uint24 internal constant ACTION_APPROVE_BUILDER_FEE = 12;
    uint24 internal constant ACTION_SEND_ASSET = 13;

    // ─── TIF (time-in-force) for limit orders ───────────────────────
    uint8 internal constant TIF_ALO = 1; // add liquidity only / post-only
    uint8 internal constant TIF_GTC = 2;
    uint8 internal constant TIF_IOC = 3;

    // ─── CoreDepositWallet `destinationDex` enum ────────────────────
    uint32 internal constant DEX_PERP = 0;
    uint32 internal constant DEX_SPOT = type(uint32).max;

    // ─── HL spot token indices ──────────────────────────────────────
    uint64 internal constant USDC_SPOT_INDEX = 0;

    // ─── System addresses (per-token bridge endpoints) ──────────────
    /// @notice For Core→EVM `sendAsset`, the `destination` field must be
    ///         the system address corresponding to the token. The HL
    ///         system then credits the EVM-side ERC-20 balance of the
    ///         action's *sender*. Format: 0x20-prefix + token index (BE).
    ///         USDC token index = 0, so the address is 0x20...0000.
    address internal constant USDC_SYSTEM_ADDRESS = 0x2000000000000000000000000000000000000000;

    // ─── Read precompiles ───────────────────────────────────────────
    address internal constant POSITION_PRECOMPILE                = 0x0000000000000000000000000000000000000800;
    address internal constant SPOT_BALANCE_PRECOMPILE            = 0x0000000000000000000000000000000000000801;
    address internal constant WITHDRAWABLE_PRECOMPILE            = 0x0000000000000000000000000000000000000803;
    address internal constant MARK_PX_PRECOMPILE                 = 0x0000000000000000000000000000000000000806;
    address internal constant ACCOUNT_MARGIN_SUMMARY_PRECOMPILE  = 0x000000000000000000000000000000000000080F;
    address internal constant CORE_USER_EXISTS_PRECOMPILE        = 0x0000000000000000000000000000000000000810;
}

/// @notice Circle's CoreDepositWallet bridge proxy (HL-specific). Call
///         `deposit()` after `IERC20.approve(...)` to move native USDC
///         from EVM to Core. Address is network-specific:
///           mainnet: 0x6b9e773128f453F5C2c60935ee2De2cBC5390a24
///           testnet: 0x0b80659a4076E9E93c7dbe0F10675A16A3e5C206
interface ICoreDepositWallet {
    /// @param amount USDC in 6-decimal native units.
    /// @param destinationDex `HLConstants.DEX_PERP` (0) for perps balance
    ///                       or `HLConstants.DEX_SPOT` (max uint32) for spot.
    function deposit(uint256 amount, uint32 destinationDex) external;
}

interface ICoreWriter {
    function sendRawAction(bytes calldata data) external;
}
