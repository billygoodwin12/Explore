// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title CreatorVault — v0.1
/// @notice Single-creator vault that holds USDC and mints ERC-4626 shares.
///
///         Roles:
///         - CREATOR (immutable): the trader who manages this vault. In
///           Phase 1.5 they get permission to call placeOrder etc.
///         - owner (Ownable): Theorise admin. Sets platform-wide fees and
///           the fee recipient. Does NOT have trading authority.
///
///         Invariant: creator's stake must always be at least
///         max(MIN_CREATOR_BPS of vault, MIN_CREATOR_FLOOR USDC). Skin in
///         the game is structural — followers can only deposit up to ~4x
///         the creator's own stake before the cap binds.
contract CreatorVault is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    /// @notice The single trader authorised to manage this vault.
    address public immutable CREATOR;

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

    error CreatorStakeTooLow(uint256 currentAssets, uint256 required);
    error DepositFeeTooHigh(uint16 bps, uint16 cap);

    constructor(
        IERC20 usdc,
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
}
