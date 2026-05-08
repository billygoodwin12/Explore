// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {HLConstants, ICoreDepositWallet, ICoreWriter} from "./HLConstants.sol";

/// @title CreatorVault — v0.1
/// @notice Single-creator vault that holds USDC, mints ERC-4626 shares,
///         and signs HyperCore trades through CoreWriter.
///
///         Roles:
///         - CREATOR (immutable): the trader who manages this vault.
///           Signs bridge + order calls.
///         - owner (Ownable): Theorise admin. Sets platform-wide fees,
///           registers builder. NO trading authority.
///
///         Invariant: creator's stake must be at least
///         min(MIN_CREATOR_BPS of vault, CREATOR_STAKE_CAP_USDC). Skin in
///         the game is structural while the vault is small; the cap
///         takes over once the vault grows past the threshold.
contract CreatorVault is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    /// @notice The single trader authorised to manage this vault.
    address public immutable CREATOR;
    /// @notice Network-specific Circle CoreDepositWallet bridge for USDC.
    ICoreDepositWallet public immutable CORE_DEPOSIT_WALLET;

    // ─── Creator stake invariant ────────────────────────────────────
    /// @notice Minimum creator stake in basis points of total vault assets.
    ///         Binds while the vault is small. As the vault grows, the
    ///         absolute USDC cap below takes over so creators aren't
    ///         forced into unbounded commitment.
    uint16 public constant MIN_CREATOR_BPS = 2000; // 20%
    /// @notice Cap on the creator-stake requirement, in USDC (6 decimals).
    ///         Once 20% of vault exceeds this, the cap binds and the
    ///         vault can scale without further creator top-up.
    uint256 public constant CREATOR_STAKE_CAP_USDC = 100e6; // $100 placeholder

    // ─── Deposit fee (admin-toggleable, default 0) ──────────────────
    /// @notice Fee skimmed from each follower deposit, in basis points.
    ///         Capped at 10% by `setDepositFee` so admin can't grief.
    uint16 public depositFeeBps;
    /// @notice Recipient of skimmed deposit fees. Zero address disables
    ///         the skim regardless of the bps value.
    address public feeRecipient;
    uint16 public constant MAX_DEPOSIT_FEE_BPS = 1000; // 10% hard cap

    event DepositFeeUpdated(uint16 bps, address recipient);
    event BridgedToCore(uint256 amount, bool toPerp);
    event BridgedToEvm(uint64 amount);
    event OrderPlaced(uint32 asset, bool isBuy, uint64 limitPx, uint64 sz, uint8 tif);
    event BuilderApproved(address indexed builder, uint64 maxFeeRate);

    error CreatorStakeTooLow(uint256 currentAssets, uint256 required);
    error DepositFeeTooHigh(uint16 bps, uint16 cap);
    error NotCreator();
    error ZeroAmount();

    modifier onlyCreator() {
        if (msg.sender != CREATOR) revert NotCreator();
        _;
    }

    constructor(
        IERC20 usdc,
        ICoreDepositWallet coreDepositWallet_,
        address creator_,
        address admin_,
        string memory name_,
        string memory symbol_
    )
        ERC4626(usdc)
        ERC20(name_, symbol_)
        Ownable(admin_)
    {
        CREATOR = creator_;
        CORE_DEPOSIT_WALLET = coreDepositWallet_;
    }

    // ─── Admin: fee config ──────────────────────────────────────────

    /// @notice Set the per-deposit fee. Pass (0, address(0)) to disable.
    function setDepositFee(uint16 bps, address recipient) external onlyOwner {
        if (bps > MAX_DEPOSIT_FEE_BPS) revert DepositFeeTooHigh(bps, MAX_DEPOSIT_FEE_BPS);
        depositFeeBps = bps;
        feeRecipient = recipient;
        emit DepositFeeUpdated(bps, recipient);
    }

    // ─── ERC-4626 overrides: fee + creator-stake invariant ──────────

    /// @dev Reduce the share quote by the fee so the depositor sees an
    ///      accurate preview. The fee comes off the gross USDC input.
    function previewDeposit(uint256 assets) public view override returns (uint256) {
        return super.previewDeposit(_netOfFee(assets));
    }

    /// @dev On `mint(shares, ...)`, the depositor must front enough USDC
    ///      to cover the fee. Gross up the asset quote.
    function previewMint(uint256 shares) public view override returns (uint256) {
        uint256 net = super.previewMint(shares);
        return _grossOfFee(net);
    }

    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override {
        // super._deposit transfers `assets` from caller and mints `shares`.
        // Shares are pre-computed by the public deposit() entry using our
        // overridden previewDeposit, so they already reflect the fee.
        super._deposit(caller, receiver, assets, shares);
        uint256 fee = assets - _netOfFee(assets);
        if (fee > 0 && feeRecipient != address(0)) {
            IERC20(asset()).safeTransfer(feeRecipient, fee);
        }
        _enforceCreatorStake();
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner_,
        uint256 assets,
        uint256 shares
    ) internal override {
        super._withdraw(caller, receiver, owner_, assets, shares);
        // Followers leaving raises creator's % automatically — only check
        // when the creator themselves is the one shrinking their stake.
        if (owner_ == CREATOR) _enforceCreatorStake();
    }

    // ─── Internal helpers ───────────────────────────────────────────

    function _netOfFee(uint256 assets) internal view returns (uint256) {
        uint16 bps = depositFeeBps;
        if (bps == 0 || feeRecipient == address(0)) return assets;
        return assets - Math.mulDiv(assets, bps, 10_000);
    }

    function _grossOfFee(uint256 net) internal view returns (uint256) {
        uint16 bps = depositFeeBps;
        if (bps == 0 || feeRecipient == address(0)) return net;
        // gross = net / (1 - bps/10000). Round up so the user sends enough.
        return Math.mulDiv(net, 10_000, 10_000 - bps, Math.Rounding.Ceil);
    }

    function _enforceCreatorStake() internal view {
        if (totalSupply() == 0) return;
        uint256 creatorAssets = convertToAssets(balanceOf(CREATOR));
        uint256 bpsFloor = Math.mulDiv(totalAssets(), MIN_CREATOR_BPS, 10_000);
        // Use the SMALLER of (20% of vault, cap). 20% binds while the vault
        // is small; the cap takes over once the vault grows past
        // CREATOR_STAKE_CAP_USDC / 0.2 (≈ $500 with the placeholder cap).
        uint256 minRequired =
            bpsFloor < CREATOR_STAKE_CAP_USDC ? bpsFloor : CREATOR_STAKE_CAP_USDC;
        if (creatorAssets < minRequired) {
            revert CreatorStakeTooLow(creatorAssets, minRequired);
        }
    }

    // ─── Bridge: EVM → Core (creator only) ──────────────────────────

    /// @notice Move USDC from this vault on EVM into its HL Core account.
    /// @param amount USDC in 6 decimals.
    /// @param toPerp true → land in perps margin; false → land in spot.
    function bridgeToCore(uint256 amount, bool toPerp) external onlyCreator {
        if (amount == 0) revert ZeroAmount();
        IERC20(asset()).forceApprove(address(CORE_DEPOSIT_WALLET), amount);
        CORE_DEPOSIT_WALLET.deposit(
            amount,
            toPerp ? HLConstants.DEX_PERP : HLConstants.DEX_SPOT
        );
        emit BridgedToCore(amount, toPerp);
    }

    // ─── Bridge: Core → EVM (creator only) ──────────────────────────

    /// @notice Move USDC from this vault's Core spot back to its EVM
    ///         ERC-20 balance, via CoreWriter sendAsset (action 13).
    /// @dev Per HL docs: for Core→EVM, the action's `destination` field
    ///      must be the per-token system address; HL credits the EVM
    ///      ERC-20 balance of the action's *sender* (this vault).
    ///      `destinationDex = type(uint32).max` matches the encoding
    ///      Circle's bridge uses for the inverse direction.
    /// @param amount USDC in 6 decimals (matches the EVM ERC-20). The
    ///        contract converts to 8-decimal Core units internally.
    function bridgeToEvm(uint256 amount) external onlyCreator {
        if (amount == 0) revert ZeroAmount();
        uint64 coreAmount = uint64(amount * 100); // 6 → 8 decimals
        bytes memory payload = abi.encode(
            HLConstants.USDC_SYSTEM_ADDRESS,    // destination = bridge system address
            address(0),                         // sourceDex (default spot)
            uint64(type(uint32).max),           // destinationDex = SPOT marker
            HLConstants.USDC_SPOT_INDEX,        // token = USDC
            coreAmount,                         // amount in 8 decimals
            uint64(0)                           // fromSubAccount
        );
        _sendAction(HLConstants.ACTION_SEND_ASSET, payload);
        emit BridgedToEvm(uint64(amount));
    }

    // ─── Trade: place limit order (creator only) ────────────────────

    /// @notice Fire a CoreWriter limit order on this vault's HL account.
    ///         Builder fee approved via setBuilderFee auto-attaches.
    /// @param asset_ HL asset ID (perp default-dex = raw universe index;
    ///               HIP-3 = 100000 + dex_idx*10000 + i).
    /// @param isBuy long if true, short if false.
    /// @param limitPx limit price scaled by 10^8.
    /// @param sz size in base asset, scaled by 10^8.
    /// @param reduceOnly true to only reduce existing position.
    /// @param tif HLConstants.TIF_IOC | TIF_GTC | TIF_ALO.
    function placeOrder(
        uint32 asset_,
        bool isBuy,
        uint64 limitPx,
        uint64 sz,
        bool reduceOnly,
        uint8 tif
    ) external onlyCreator {
        bytes memory payload = abi.encode(
            asset_, isBuy, limitPx, sz, reduceOnly, tif, uint128(0) // cloid 0
        );
        _sendAction(HLConstants.ACTION_LIMIT_ORDER, payload);
        emit OrderPlaced(asset_, isBuy, limitPx, sz, tif);
    }

    // ─── Admin: builder fee approval ────────────────────────────────

    /// @notice Approve a builder to skim a max fee rate from this vault's
    ///         orders. Called once per builder. Admin only.
    /// @param builder Theorise's HL builder address.
    /// @param maxFeeRate Per HL action 12 schema. Verify unit on first
    ///                   testnet call (likely tenths of bps; 5 bps = 50).
    function setBuilderFee(address builder, uint64 maxFeeRate) external onlyOwner {
        bytes memory payload = abi.encode(maxFeeRate, builder);
        _sendAction(HLConstants.ACTION_APPROVE_BUILDER_FEE, payload);
        emit BuilderApproved(builder, maxFeeRate);
    }

    // ─── Internal: CoreWriter raw-action shape ──────────────────────

    function _sendAction(uint24 actionId, bytes memory payload) internal {
        bytes memory data = bytes.concat(bytes1(0x01), bytes3(actionId), payload);
        ICoreWriter(HLConstants.CORE_WRITER).sendRawAction(data);
    }
}
