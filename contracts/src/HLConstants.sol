// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Pinned addresses + action IDs for HyperCore <> HyperEVM.
/// Source: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore
/// and github.com/hyperliquid-dev/hyper-evm-lib (HLConstants.sol).
library HLConstants {
    // ── CoreWriter ───────────────────────────────────────────────
    address internal constant CORE_WRITER = 0x3333333333333333333333333333333333333333;

    // Action IDs (3 bytes, big-endian, prefixed with version byte 0x01).
    uint24 internal constant ACTION_LIMIT_ORDER          = 1;
    uint24 internal constant ACTION_VAULT_TRANSFER       = 2;
    uint24 internal constant ACTION_TOKEN_DELEGATE       = 3;
    uint24 internal constant ACTION_STAKING_DEPOSIT      = 4;
    uint24 internal constant ACTION_STAKING_WITHDRAW     = 5;
    uint24 internal constant ACTION_SPOT_SEND            = 6;
    uint24 internal constant ACTION_USD_CLASS_TRANSFER   = 7;
    uint24 internal constant ACTION_CANCEL_ORDER_BY_OID  = 10;
    uint24 internal constant ACTION_CANCEL_ORDER_BY_CLOID = 11;

    // Time-in-force codes for limit orders.
    uint8 internal constant TIF_ALO = 1;
    uint8 internal constant TIF_GTC = 2;
    uint8 internal constant TIF_IOC = 3;

    // ── Read precompiles (0x0800–0x0810) ─────────────────────────
    address internal constant POSITION_PRECOMPILE                 = 0x0000000000000000000000000000000000000800;
    address internal constant SPOT_BALANCE_PRECOMPILE             = 0x0000000000000000000000000000000000000801;
    address internal constant VAULT_EQUITY_PRECOMPILE             = 0x0000000000000000000000000000000000000802;
    address internal constant WITHDRAWABLE_PRECOMPILE             = 0x0000000000000000000000000000000000000803;
    address internal constant DELEGATIONS_PRECOMPILE              = 0x0000000000000000000000000000000000000804;
    address internal constant DELEGATOR_SUMMARY_PRECOMPILE        = 0x0000000000000000000000000000000000000805;
    address internal constant MARK_PX_PRECOMPILE                  = 0x0000000000000000000000000000000000000806;
    address internal constant ORACLE_PX_PRECOMPILE                = 0x0000000000000000000000000000000000000807;
    address internal constant SPOT_PX_PRECOMPILE                  = 0x0000000000000000000000000000000000000808;
    address internal constant L1_BLOCK_NUMBER_PRECOMPILE          = 0x0000000000000000000000000000000000000809;
    address internal constant PERP_ASSET_INFO_PRECOMPILE          = 0x000000000000000000000000000000000000080a;
    address internal constant SPOT_INFO_PRECOMPILE                = 0x000000000000000000000000000000000000080b;
    address internal constant TOKEN_INFO_PRECOMPILE               = 0x000000000000000000000000000000000000080C;
    address internal constant TOKEN_SUPPLY_PRECOMPILE             = 0x000000000000000000000000000000000000080D;
    address internal constant BBO_PRECOMPILE                      = 0x000000000000000000000000000000000000080e;
    address internal constant ACCOUNT_MARGIN_SUMMARY_PRECOMPILE   = 0x000000000000000000000000000000000000080F;
    address internal constant CORE_USER_EXISTS_PRECOMPILE         = 0x0000000000000000000000000000000000000810;

    // ── USDC bridge ──────────────────────────────────────────────
    // ERC20 USDC on HyperEVM mainnet / testnet.
    address internal constant USDC_EVM_MAINNET = 0xb88339CB7199b77E23DB6E890353E22632Ba630f;
    address internal constant USDC_EVM_TESTNET = 0x2B3370eE501B4a559b57D449569354196457D8Ab;
    // Send USDC ERC20 to this address; the sender's HyperCore spot account
    // is credited with the same amount (minus bridge fees if any).
    address internal constant CORE_DEPOSIT_WALLET_MAINNET = 0x6B9E773128f453f5c2C60935Ee2DE2CBc5390A24;
    address internal constant CORE_DEPOSIT_WALLET_TESTNET = 0x0B80659a4076E9E93C7DbE0f10675A16a3e5C206;
}
