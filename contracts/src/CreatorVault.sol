// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {HLConstants, ICoreWriter} from "./HLConstants.sol";

/// @title  CreatorVault — Theorise Phase 1.5
/// @notice Creator-led vault with Core-side custody. Followers send USDC
///         on HyperCore to the vault address (same address as this EVM
///         contract, mirrored on Core), then call `depositCore` here to
///         claim ERC-20 share tokens. Creator trades the vault's Core
///         account directly via CoreWriter actions.
///
///         The vault holds NO EVM USDC. `asset()` returns HyperEVM USDC
///         purely as a denomination label; the standard ERC-4626
///         deposit/redeem surface reverts. Use `depositCore` /
///         `redeemCore` exclusively.
contract CreatorVault is ERC4626, Ownable {
    address public immutable CREATOR;

    uint16 public constant MIN_CREATOR_BPS = 2000;
    uint256 public constant CREATOR_STAKE_CAP_USDC = 100e6;

    uint16 public depositFeeBps;
    address public feeRecipient;
    uint16 public constant MAX_DEPOSIT_FEE_BPS = 1000;

    /// @notice Watermark of vault's Core spot USDC (6-dec) the contract
    ///         has reconciled. `currentCoreSpot - lastSeenCoreSpot` is
    ///         the unaccounted-for delta available to `depositCore`.
    uint256 public lastSeenCoreSpot;

    event DepositFeeUpdated(uint16 bps, address recipient);
    event DepositedCore(address indexed caller, address indexed receiver, uint256 delta, uint256 fee, uint256 shares);
    event Redeemed(address indexed owner, address indexed coreReceiver, uint256 shares, uint256 amount);
    event MovedOnCore(uint256 amount, bool toPerp);
    event OrderPlaced(uint32 asset, bool isBuy, uint64 limitPx, uint64 sz, uint8 tif);
    event BuilderApproved(address indexed builder, uint64 maxFeeRate);
    event Reconciled(uint256 oldWatermark, uint256 newWatermark);

    error UseCoreFlow();
    error NoDeposit();
    error SlippageExceeded(uint256 got, uint256 min);
    error InsufficientSpot(uint256 spot, uint256 needed);
    error CreatorStakeTooLow(uint256 currentAssets, uint256 required);
    error DepositFeeTooHigh(uint16 bps, uint16 cap);
    error PrecompileFailed(address precompile);
    error NotCreator();
    error ZeroAmount();
    error ZeroAddress();

    modifier onlyCreator() {
        if (msg.sender != CREATOR) revert NotCreator();
        _;
    }

    constructor(IERC20 usdc, address creator_, address admin_, string memory name_, string memory symbol_)
        ERC4626(usdc) ERC20(name_, symbol_) Ownable(admin_)
    {
        if (creator_ == address(0)) revert ZeroAddress();
        CREATOR = creator_;
    }

    /// @notice Virtual-shares offset for inflation-attack resistance.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    // ─── ERC-4626 surface (neutered) ────────────────────────────────────

    function maxDeposit(address) public pure override returns (uint256) { return 0; }
    function maxMint(address) public pure override returns (uint256) { return 0; }
    function maxWithdraw(address) public pure override returns (uint256) { return 0; }
    function maxRedeem(address) public pure override returns (uint256) { return 0; }

    function deposit(uint256, address) public pure override returns (uint256) { revert UseCoreFlow(); }
    function mint(uint256, address) public pure override returns (uint256) { revert UseCoreFlow(); }
    function withdraw(uint256, address, address) public pure override returns (uint256) { revert UseCoreFlow(); }
    function redeem(uint256, address, address) public pure override returns (uint256) { revert UseCoreFlow(); }

    function previewDeposit(uint256) public pure override returns (uint256) { revert UseCoreFlow(); }
    function previewMint(uint256) public pure override returns (uint256) { revert UseCoreFlow(); }
    function previewWithdraw(uint256) public pure override returns (uint256) { revert UseCoreFlow(); }
    function previewRedeem(uint256) public pure override returns (uint256) { revert UseCoreFlow(); }

    // ─── Asset accounting (Core-side reads) ────────────────────────────────

    /// @notice Total USDC the vault claims, in 6-dec EVM units.
    ///         = vault's Core spot USDC + perp accountValue.
    function totalAssets() public view override returns (uint256) {
        return _coreSpotUSDC() + _corePerpAccountValue();
    }

    function _coreSpotUSDC() internal view returns (uint256) {
        (bool ok, bytes memory data) = HLConstants.SPOT_BALANCE_PRECOMPILE.staticcall(
            abi.encode(address(this), HLConstants.USDC_SPOT_INDEX)
        );
        if (!ok) revert PrecompileFailed(HLConstants.SPOT_BALANCE_PRECOMPILE);
        (uint64 total,,) = abi.decode(data, (uint64, uint64, uint64));
        return uint256(total) / 100; // 8-dec native → 6-dec EVM
    }

    function _corePerpAccountValue() internal view returns (uint256) {
        (bool ok, bytes memory data) = HLConstants.ACCOUNT_MARGIN_SUMMARY_PRECOMPILE.staticcall(
            abi.encode(uint32(0), address(this))
        );
        if (!ok) revert PrecompileFailed(HLConstants.ACCOUNT_MARGIN_SUMMARY_PRECOMPILE);
        (int64 accountValue,,,) = abi.decode(data, (int64, uint64, int64, int64));
        return accountValue > 0 ? uint256(uint64(accountValue)) / 100 : 0;
    }

    // ─── Admin: fee config ────────────────────────────────────────────

    function setDepositFee(uint16 bps, address recipient) external onlyOwner {
        if (bps > MAX_DEPOSIT_FEE_BPS) revert DepositFeeTooHigh(bps, MAX_DEPOSIT_FEE_BPS);
        depositFeeBps = bps;
        feeRecipient = recipient;
        emit DepositFeeUpdated(bps, recipient);
    }

    /// @notice Admin reset of the watermark. Use if a Core action fails
    ///         silently and `lastSeenCoreSpot` drifts from reality.
    function reconcile() external onlyOwner {
        uint256 oldW = lastSeenCoreSpot;
        uint256 newW = _coreSpotUSDC();
        lastSeenCoreSpot = newW;
        emit Reconciled(oldW, newW);
    }

    // ─── Core deposit / redeem ─────────────────────────────────────────

    /// @notice Claim shares for unaccounted USDC sent to vault Core spot.
    ///         Caller must already have transferred USDC to address(this)
    ///         on Core. Mints shares to `receiver` for the delta against
    ///         `lastSeenCoreSpot`, less optional fee.
    function depositCore(address receiver, uint256 minShares) external returns (uint256 shares) {
        if (receiver == address(0)) revert ZeroAddress();

        uint256 currentSpot = _coreSpotUSDC();
        uint256 last = lastSeenCoreSpot;
        if (currentSpot <= last) revert NoDeposit();
        uint256 delta = currentSpot - last;

        // Optional fee on the gross delta
        uint16 bps = depositFeeBps;
        address recip = feeRecipient;
        uint256 fee = (bps > 0 && recip != address(0))
            ? Math.mulDiv(delta, bps, 10_000)
            : 0;
        uint256 net = delta - fee;

        // Pre-deposit assets for fair share pricing
        uint256 preAssets = totalAssets() - delta;
        uint256 supply = totalSupply();

        // Inline OZ ERC-4626 share math (mirrors _convertToShares)
        shares = Math.mulDiv(net, supply + 10 ** _decimalsOffset(), preAssets + 1, Math.Rounding.Floor);
        if (shares < minShares) revert SlippageExceeded(shares, minShares);

        lastSeenCoreSpot = currentSpot;
        _mint(receiver, shares);

        if (fee > 0) {
            _spotSendCore(recip, fee);
            // Eagerly track fee outflow (settles a few seconds after dispatch)
            lastSeenCoreSpot -= fee;
        }

        _enforceCreatorStake();
        emit DepositedCore(msg.sender, receiver, delta, fee, shares);
    }

    /// @notice Burn `shares` and send pro-rata Core USDC to `coreReceiver`.
    function redeemCore(uint256 shares, address coreReceiver) external returns (uint256 amount) {
        if (shares == 0) revert ZeroAmount();
        if (coreReceiver == address(0)) revert ZeroAddress();

        uint256 supply = totalSupply();
        if (supply == 0) revert NoDeposit();

        // OZ-style pro-rata
        amount = Math.mulDiv(shares, totalAssets() + 1, supply + 10 ** _decimalsOffset(), Math.Rounding.Floor);

        // Must have enough on Core spot — perp positions are not auto-unwound
        uint256 spot = _coreSpotUSDC();
        if (spot < amount) revert InsufficientSpot(spot, amount);

        _burn(msg.sender, shares);
        _spotSendCore(coreReceiver, amount);
        lastSeenCoreSpot -= amount;

        if (msg.sender == CREATOR) _enforceCreatorStake();
        emit Redeemed(msg.sender, coreReceiver, shares, amount);
    }

    // ─── Creator stake invariant ───────────────────────────────────────

    function _enforceCreatorStake() internal view {
        if (totalSupply() == 0) return;
        uint256 ca = convertToAssets(balanceOf(CREATOR));
        uint256 bf = Math.mulDiv(totalAssets(), MIN_CREATOR_BPS, 10_000);
        uint256 mr = bf < CREATOR_STAKE_CAP_USDC ? bf : CREATOR_STAKE_CAP_USDC;
        if (ca < mr) revert CreatorStakeTooLow(ca, mr);
    }

    // ─── Trading actions (creator-only) ───────────────────────────────────

    function moveOnCore(uint256 amount, bool toPerp) external onlyCreator {
        if (amount == 0) revert ZeroAmount();
        bytes memory payload = abi.encode(uint64(amount * 100), toPerp);
        _sendAction(HLConstants.ACTION_USD_CLASS_TRANSFER, payload);
        if (toPerp) lastSeenCoreSpot -= amount;
        else lastSeenCoreSpot += amount;
        emit MovedOnCore(amount, toPerp);
    }

    function placeOrder(uint32 asset_, bool isBuy, uint64 limitPx, uint64 sz, bool reduceOnly, uint8 tif)
        external onlyCreator
    {
        bytes memory payload = abi.encode(asset_, isBuy, limitPx, sz, reduceOnly, tif, uint128(0));
        _sendAction(HLConstants.ACTION_LIMIT_ORDER, payload);
        emit OrderPlaced(asset_, isBuy, limitPx, sz, tif);
    }

    function setBuilderFee(address builder, uint64 maxFeeRate) external onlyOwner {
        bytes memory payload = abi.encode(maxFeeRate, builder);
        _sendAction(HLConstants.ACTION_APPROVE_BUILDER_FEE, payload);
        emit BuilderApproved(builder, maxFeeRate);
    }

    // ─── Internals ───────────────────────────────────────────────────────

    function _spotSendCore(address coreReceiver, uint256 amount6) internal {
        uint64 amount8 = uint64(amount6 * 100);
        bytes memory payload = abi.encode(coreReceiver, HLConstants.USDC_SPOT_INDEX, amount8);
        _sendAction(HLConstants.ACTION_SPOT_SEND, payload);
    }

    function _sendAction(uint24 actionId, bytes memory payload) internal {
        bytes memory data = bytes.concat(bytes1(0x01), bytes3(actionId), payload);
        ICoreWriter(HLConstants.CORE_WRITER).sendRawAction(data);
    }
}
