// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {HLConstants} from "./HLConstants.sol";

interface ICoreWriter {
    function sendRawAction(bytes calldata data) external;
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/**
 * @title PerpOrderSpike
 * @notice Minimal contract proving the HyperEVM -> HyperCore order path.
 *
 * Lifecycle for testnet validation:
 *   1. Deploy this contract on HyperEVM testnet from your funded EOA.
 *   2. Send USDC (testnet ERC20) to this contract's address.
 *   3. Call bridgeUsdcToCore(amount) — moves ERC20 USDC into the contract's
 *      HyperCore spot account by transferring to CORE_DEPOSIT_WALLET.
 *   4. Call moveSpotToPerp(amount) — sweeps spot USDC into perp margin via
 *      CoreWriter action 7.
 *   5. Call placeIocOrder(asset, isBuy, limitPx1e8, sz1e8) — fires CoreWriter
 *      action 1. The order shows up on HyperCore a few seconds later.
 *
 * Intentionally has no access control, no withdrawals, no error recovery.
 * Burn the deployment after testing.
 */
contract PerpOrderSpike {
    address public immutable owner;
    address public immutable usdc;
    address public immutable coreDepositWallet;

    event RawActionSent(uint24 indexed actionId, bytes payload);
    event UsdcBridged(uint256 amount);
    event BuilderApproved(address indexed builder, uint64 maxFeeBps);
    event UsdcBridgedBack(uint64 amount);
    event ApiWalletAdded(address indexed agent, string apiName);

    error NotOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param _usdc ERC20 USDC contract for this network.
    /// @param _coreDepositWallet System address that credits HyperCore spot when receiving USDC.
    constructor(address _usdc, address _coreDepositWallet) {
        owner = msg.sender;
        usdc = _usdc;
        coreDepositWallet = _coreDepositWallet;
    }

    // ── Step A: bridge USDC EVM -> Core spot ─────────────────────
    function bridgeUsdcToCore(uint256 amount) external onlyOwner {
        // Transferring USDC ERC20 to the system wallet credits this contract's
        // HyperCore spot account with the same amount.
        require(IERC20(usdc).transfer(coreDepositWallet, amount), "usdc transfer");
        emit UsdcBridged(amount);
    }

    // ── Step B: spot -> perp via CoreWriter action 7 ─────────────
    /// @param ntl Notional in HyperCore "ntl" units (USDC = 6 decimals on Core).
    /// @param toPerp true = spot -> perp; false = perp -> spot.
    function moveUsdClass(uint64 ntl, bool toPerp) external onlyOwner {
        bytes memory payload = abi.encode(ntl, toPerp);
        _sendAction(HLConstants.ACTION_USD_CLASS_TRANSFER, payload);
    }

    // ── Step C: place IOC perp order via CoreWriter action 1 ─────
    /// @param asset HyperCore asset ID (default-dex perps are the raw universe
    ///              index; HIP-3 asset ID = 100000 + dex_index*10000 + i).
    /// @param isBuy long if true, short if false.
    /// @param limitPx1e8 limit price scaled by 10^8.
    /// @param sz1e8 size in base asset, scaled by 10^8.
    function placeIocOrder(
        uint32 asset,
        bool isBuy,
        uint64 limitPx1e8,
        uint64 sz1e8
    ) external onlyOwner {
        bytes memory payload = abi.encode(
            asset,
            isBuy,
            limitPx1e8,
            sz1e8,
            false,                  // reduceOnly
            HLConstants.TIF_IOC,    // 3
            uint128(0)              // cloid (0 = none)
        );
        _sendAction(HLConstants.ACTION_LIMIT_ORDER, payload);
    }

    // ── Spike (a): one-time builder fee approval (action 12) ─────
    /// @param builder the Theorise builder address that should receive the fee.
    /// @param maxFeeBps the max basis-point fee this contract authorizes the
    ///        builder to skim from its own orders going forward.
    /// @dev fires CoreWriter action 12. Subsequent perp orders placed by this
    ///      contract will auto-attach the approved builder. Verify on HL by
    ///      polling the builder's user state for an incremented fee balance
    ///      after the next placeIocOrder fills.
    function approveBuilderFee(address builder, uint64 maxFeeBps) external onlyOwner {
        bytes memory payload = abi.encode(maxFeeBps, builder);
        _sendAction(HLConstants.ACTION_APPROVE_BUILDER_FEE, payload);
        emit BuilderApproved(builder, maxFeeBps);
    }

    // ── Spike (b): Core -> EVM USDC unbridge (action 13) ─────────
    /// @param amount USDC amount in HyperCore "ntl" units (6 decimals).
    /// @dev sends the contract's Core USDC spot balance to the canonical
    ///      Core->EVM bridge address (0x20...0 for USDC, token index 0).
    ///      The corresponding ERC20 USDC balance on HyperEVM is then credited
    ///      to address(this). Confirm with `IERC20(usdc).balanceOf(address(this))`
    ///      a few seconds after firing.
    ///
    /// sendAsset payload layout (best inferred from public docs):
    ///   (address destination, address token, uint32 srcDexIndex,
    ///    uint32 dstDexIndex, uint64 amount, uint64 nonce)
    /// For USDC Core->EVM: destination = CORE_TO_EVM_BRIDGE_USDC,
    /// token = address(0) (USDC implied), src/dst dex = 0, nonce = 0.
    /// If the on-chain layout differs once tested, adjust here only.
    function bridgeUsdcBackToEvm(uint64 amount) external onlyOwner {
        bytes memory payload = abi.encode(
            HLConstants.CORE_TO_EVM_BRIDGE_USDC, // destination
            address(0),                          // token (USDC implied via destination)
            uint32(0),                           // srcDexIndex (default dex)
            uint32(0),                           // dstDexIndex (default dex)
            amount,                              // amount in 6dp
            uint64(0)                            // nonce
        );
        _sendAction(HLConstants.ACTION_SEND_ASSET, payload);
        emit UsdcBridgedBack(amount);
    }

    // ── Spike (c, fallback): authorize an EOA agent (action 9) ───
    /// @param agent EOA that will sign HL actions on behalf of address(this).
    /// @param apiName label HL stores alongside the agent (free-form string).
    /// @dev only relevant if Path 1 (CoreWriter) hits a blocker and we have to
    ///      fall back to off-chain agent signing. If this succeeds and the
    ///      agent can subsequently place orders against this contract's HL
    ///      account, Path 2 stays viable as a fallback.
    function addApiWallet(address agent, string calldata apiName) external onlyOwner {
        bytes memory payload = abi.encode(agent, apiName);
        _sendAction(HLConstants.ACTION_ADD_API_WALLET, payload);
        emit ApiWalletAdded(agent, apiName);
    }

    // ── Helpers ──────────────────────────────────────────────────
    function _sendAction(uint24 actionId, bytes memory payload) internal {
        // Layout: 0x01 (version) || actionId (3B big-endian) || abi.encode(...)
        bytes memory data = bytes.concat(
            bytes1(0x01),
            bytes3(actionId),
            payload
        );
        ICoreWriter(HLConstants.CORE_WRITER).sendRawAction(data);
        emit RawActionSent(actionId, data);
    }

    // ── Read helpers (precompile staticcalls) ────────────────────
    /// @notice Mark price for a perp asset, scaled by 10^(6 - szDecimals).
    function markPx(uint32 perpIndex) external view returns (uint64) {
        (bool ok, bytes memory ret) = HLConstants.MARK_PX_PRECOMPILE.staticcall(
            abi.encode(perpIndex)
        );
        require(ok && ret.length == 32, "markPx");
        return abi.decode(ret, (uint64));
    }

    /// @notice Account margin summary for `user` on perp dex `perpDexIndex`
    ///         (0 = default dex). Returns raw bytes; decode off-chain or
    ///         add a typed wrapper once the struct layout is verified.
    function accountMarginSummary(uint32 perpDexIndex, address user)
        external
        view
        returns (bytes memory)
    {
        (bool ok, bytes memory ret) = HLConstants
            .ACCOUNT_MARGIN_SUMMARY_PRECOMPILE
            .staticcall(abi.encode(perpDexIndex, user));
        require(ok, "marginSummary");
        return ret;
    }

    /// @notice Did `user` ever transact on HyperCore? Useful before bridging.
    function coreUserExists(address user) external view returns (bool) {
        (bool ok, bytes memory ret) = HLConstants.CORE_USER_EXISTS_PRECOMPILE.staticcall(
            abi.encode(user)
        );
        require(ok && ret.length == 32, "coreUserExists");
        return abi.decode(ret, (bool));
    }
}
