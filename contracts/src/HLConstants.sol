// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice HyperLiquid system contracts, CoreWriter action IDs, and read
///         precompile addresses. Network-agnostic — token addresses
///         (USDC) are passed at construction in consumer contracts.
library HLConstants {
    /// @notice CoreWriter precompile, identical on mainnet and testnet.
    ///         Accepts raw bytes shaped as:
    ///           1B  version  (always 0x01)
    ///           3B  actionId (big-endian uint24)
    ///           NB  abi.encoded payload
    address internal constant CORE_WRITER = 0x3333333333333333333333333333333333333333;

    // ─── CoreWriter action IDs ──────────────────────────────────
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

    // ─── HL spot token indices ────────────────────────────────────
    uint64 internal constant USDC_SPOT_INDEX = 0;

    // ─── System addresses (per-token bridge endpoints) ──────────────
    /// @notice For Core→EVM `spotSend`, the `destination` field can be
    ///         this system address (HL credits the EVM-side ERC-20
    ///         balance of the action's *sender*). 0x20-prefix + token
    ///         index (BE). USDC token index = 0 → 0x20…0000.
    address internal constant USDC_SYSTEM_ADDRESS = 0x2000000000000000000000000000000000000000;

    // ─── Read precompiles ───────────────────────────────────────
    address internal constant POSITION_PRECOMPILE                = 0x0000000000000000000000000000000000000800;
    address internal constant SPOT_BALANCE_PRECOMPILE            = 0x0000000000000000000000000000000000000801;
    address internal constant WITHDRAWABLE_PRECOMPILE            = 0x0000000000000000000000000000000000000803;
    address internal constant MARK_PX_PRECOMPILE                 = 0x0000000000000000000000000000000000000806;
    address internal constant ACCOUNT_MARGIN_SUMMARY_PRECOMPILE  = 0x000000000000000000000000000000000000080F;
    address internal constant CORE_USER_EXISTS_PRECOMPILE        = 0x0000000000000000000000000000000000000810;
}

/// @notice CoreWriter sink — the only on-chain action interface we need
///         for the Core-side deposit / redeem / trading flow.
interface ICoreWriter {
    function sendRawAction(bytes calldata data) external;
}
