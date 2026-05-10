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

    // ─── CoreWriter action IDs ──────────────────────────────
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

    // ─── HL spot token indices ────────────────────────────────
    uint64 internal constant USDC_SPOT_INDEX = 0;

    // ─── System addresses (per-token bridge endpoints) ──────────────
    /// @notice For Core→EVM `spotSend`, the `destination` field can be
    ///         this system address (HL credits the EVM-side ERC-20
    ///         balance of the action's *sender*). 0x20-prefix + token
    ///         index (BE). USDC token index = 0 → 0x20…0000.
    ///
    ///         NOTE: This address is on Circle's USDC blacklist. Direct
    ///         `transfer(USDC_SYSTEM_ADDRESS, X)` from a contract reverts
    ///         with `Blacklistable: account is blacklisted` on both
    ///         testnet and mainnet (verified via mainnet fork test,
    ///         INVESTIGATION_EVM_DEPOSIT.md §9). To bridge EVM→Core USDC
    ///         from a contract, use Circle's `CoreDepositWallet.depositFor`
    ///         pattern via `ICoreDepositWallet` below.
    address internal constant USDC_SYSTEM_ADDRESS = 0x2000000000000000000000000000000000000000;

    // ─── CoreDepositWallet (Circle USDC bridge proxy) ───────────────
    /// @notice Mainnet CoreDepositWallet (chain 999). Heavily used —
    ///         450K+ txs, $1.27B USDC volume. Wraps the system-address
    ///         transfer so contract callers can bridge without tripping
    ///         Circle's blacklist.
    address internal constant CORE_DEPOSIT_WALLET_MAINNET =
        0x6B9E773128f453f5c2C60935Ee2DE2CBc5390A24;
    /// @notice Testnet CoreDepositWallet (chain 998). Behavior is not
    ///         verified end-to-end on testnet — three rounds of
    ///         `depositFor` from a contract silently failed to credit
    ///         Core during the May 9 testnet session. Use only with
    ///         caution; mainnet probe is the authoritative test.
    address internal constant CORE_DEPOSIT_WALLET_TESTNET =
        0x0B80659a4076E9E93C7DbE0f10675A16a3e5C206;

    /// @notice `destinationDex` value passed to `depositFor` for Core
    ///         SPOT (0xFFFFFFFF). `0` would route to Core PERPS dex.
    uint32 internal constant CDW_DESTINATION_SPOT = type(uint32).max;
    uint32 internal constant CDW_DESTINATION_PERPS = 0;

    // ─── Read precompiles ────────────────────────────────────
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

/// @notice Circle's `CoreDepositWallet` interface. Used by production HL
///         protocols (Monetrix, hyper-evm-lib, Circle CCTP forwarder) to
///         bridge EVM→Core USDC from a contract caller without hitting
///         Circle's blacklist on `USDC_SYSTEM_ADDRESS`.
///
///         Flow inside the wallet:
///           1. `USDC.transferFrom(msg.sender, wallet, amount)` — requires
///              prior approval.
///           2. Wallet emits a synthetic `Transfer(wallet → 0x2000…0000,
///              amount)` event that HyperCore observes.
///           3. HyperCore credits `recipient`'s Core spot balance.
///           4. If `destinationDex != 0xFFFFFFFF`, wallet additionally
///              calls CoreWriter action 13 (SEND_ASSET) to forward from
///              spot to perps dex.
interface ICoreDepositWallet {
    function depositFor(address recipient, uint256 amount, uint32 destinationDex) external;
}
