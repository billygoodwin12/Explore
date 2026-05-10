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
///
///         Creator stake invariant: the creator must hold at least
///         `min(MIN_CREATOR_BPS of totalAssets, creatorStakeCapUsdc)`
///         worth of shares. Below that threshold the vault enters a
///         48-hour cure period during which the creator can top up.
///         After the cure period expires, creator-side actions (deposit,
///         move, trade) halt; redemptions remain open so followers can
///         always exit.
contract CreatorVault is ERC4626, Ownable {
    address public immutable CREATOR;

    // ─── Stake-invariant parameters ────────────────────────────────────────────
    /// @notice Floor percentage of vault value the creator must hold,
    ///         in basis points (500 = 5%).
    uint16 public constant MIN_CREATOR_BPS = 500;

    /// @notice Hard bounds for the mutable stake cap. Admin can adjust
    ///         within this range; outside is rejected.
    uint256 public constant CREATOR_STAKE_CAP_MIN = 100_000e6;   // $100K
    uint256 public constant CREATOR_STAKE_CAP_MAX = 5_000_000e6; // $5M

    /// @notice Time the creator has to top up after a stake breach
    ///         starts before creator-side actions halt.
    uint256 public constant STAKE_CURE_PERIOD = 48 hours;

    /// @notice Mutable stake cap in 6-dec USDC. Initialized to $250K in
    ///         the constructor; admin can set within bounds via
    ///         `setCreatorStakeCap`.
    uint256 public creatorStakeCapUsdc;

    /// @notice Timestamp when the most recent stake breach began. 0 = compliant.
    uint256 public stakeBreachStartedAt;

    // ─── Deposit fee ────────────────────────────────────────────────────
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
    event StakeBreachStarted(uint256 currentStake, uint256 required, uint256 timestamp);
    event StakeBreachCured(uint256 currentStake, uint256 required, uint256 timestamp);
    event StakeCapUpdated(uint256 oldCap, uint256 newCap);

    error UseCoreFlow();
    error NoDeposit();
    error SlippageExceeded(uint256 got, uint256 min);
    error InsufficientSpot(uint256 spot, uint256 needed);
    error StakeInvariantBreached(uint256 currentStake, uint256 required);
    error StakeCureExpired(uint256 breachStartedAt, uint256 elapsedSeconds);
    error CapOutOfBounds(uint256 newCap, uint256 minCap, uint256 maxCap);
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
        creatorStakeCapUsdc = 250_000e6;
    }

    /// @notice Virtual-shares offset for inflation-attack resistance.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    // ─── ERC-4626 surface (neutered) ──────────────────────────────────────

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

    // ─── Asset accounting (Core-side reads) ───────────────────────────────────

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
        // (int64 accountValue, uint64 marginUsed, uint64 ntlPos, int64 rawUsd)
        // All four fields are 6-dec USDC (perp accounting) — same units as
        // our internal totalAssets, so no scaling needed.
        (int64 accountValue,,,) = abi.decode(data, (int64, uint64, uint64, int64));
        return accountValue > 0 ? uint256(uint64(accountValue)) : 0;
    }

    // ─── Stake-invariant views + state machine ──────────────────────────────

    /// @notice Returns the minimum creator stake required at current vault size.
    ///         = min(MIN_CREATOR_BPS of totalAssets, creatorStakeCapUsdc).
    function requiredCreatorStake() external view returns (uint256) {
        return _requiredCreatorStake();
    }

    /// @notice Returns whether the vault is currently in a stake breach,
    ///         and how many seconds the breach has been ongoing.
    function isInBreach() external view returns (bool inBreach, uint256 elapsedSeconds) {
        uint256 startedAt = stakeBreachStartedAt;
        if (startedAt == 0) return (false, 0);
        return (true, block.timestamp - startedAt);
    }

    function _requiredCreatorStake() internal view returns (uint256) {
        uint256 percentBased = Math.mulDiv(totalAssets(), MIN_CREATOR_BPS, 10_000);
        return percentBased < creatorStakeCapUsdc ? percentBased : creatorStakeCapUsdc;
    }

    /// @notice Records the current stake-breach state. Called at the END
    ///         of any state-mutating function. Does NOT revert.
    function _updateStakeBreachState() internal {
        if (totalSupply() == 0) {
            if (stakeBreachStartedAt != 0) stakeBreachStartedAt = 0;
            return;
        }
        uint256 currentStake = convertToAssets(balanceOf(CREATOR));
        uint256 required = _requiredCreatorStake();
        if (currentStake < required) {
            if (stakeBreachStartedAt == 0) {
                stakeBreachStartedAt = block.timestamp;
                emit StakeBreachStarted(currentStake, required, block.timestamp);
            }
        } else {
            if (stakeBreachStartedAt != 0) {
                emit StakeBreachCured(currentStake, required, block.timestamp);
                stakeBreachStartedAt = 0;
            }
        }
    }

    /// @notice Reverts if a stake breach has been ongoing past the cure
    ///         period. Use as a guard on creator-side operations that
    ///         should halt during prolonged breach. Redemptions never call
    ///         this — followers must always be able to exit.
    function _requireStakeWithinCure() internal view {
        uint256 startedAt = stakeBreachStartedAt;
        if (startedAt == 0) return;
        if (block.timestamp > startedAt + STAKE_CURE_PERIOD) {
            revert StakeCureExpired(startedAt, block.timestamp - startedAt);
        }
    }

    // ─── Admin: fee config + cap config ─────────────────────────────────────

    function setDepositFee(uint16 bps, address recipient) external onlyOwner {
        if (bps > MAX_DEPOSIT_FEE_BPS) revert DepositFeeTooHigh(bps, MAX_DEPOSIT_FEE_BPS);
        depositFeeBps = bps;
        feeRecipient = recipient;
        emit DepositFeeUpdated(bps, recipient);
    }

    /// @notice Set the creator stake cap. Bounded by [MIN, MAX] to prevent
    ///         admin from disabling the invariant or making it absurdly
    ///         restrictive. Time-lock added in PR 5.
    function setCreatorStakeCap(uint256 newCap) external onlyOwner {
        if (newCap < CREATOR_STAKE_CAP_MIN || newCap > CREATOR_STAKE_CAP_MAX) {
            revert CapOutOfBounds(newCap, CREATOR_STAKE_CAP_MIN, CREATOR_STAKE_CAP_MAX);
        }
        uint256 old = creatorStakeCapUsdc;
        creatorStakeCapUsdc = newCap;
        emit StakeCapUpdated(old, newCap);
    }

    /// @notice Admin reset of the watermark. Use if a Core action fails
    ///         silently and `lastSeenCoreSpot` drifts from reality.
    function reconcile() external onlyOwner {
        uint256 oldW = lastSeenCoreSpot;
        uint256 newW = _coreSpotUSDC();
        lastSeenCoreSpot = newW;
        emit Reconciled(oldW, newW);
    }

    // ─── Core deposit / redeem ──────────────────────────────────────────

    /// @notice Quote what `depositCore` would mint right now. Returns the
    ///         unaccounted-for Core spot delta, the fee that would skim,
    ///         and the shares the receiver would get. UI polls this to
    ///         surface "X USDC pending claim → Y shares" before signing.
    function previewDepositCore() external view returns (uint256 delta, uint256 fee, uint256 shares) {
        uint256 currentSpot = _coreSpotUSDC();
        uint256 last = lastSeenCoreSpot;
        if (currentSpot <= last) return (0, 0, 0);
        delta = currentSpot - last;

        uint16 bps = depositFeeBps;
        address recip = feeRecipient;
        fee = (bps > 0 && recip != address(0)) ? Math.mulDiv(delta, bps, 10_000) : 0;
        uint256 net = delta - fee;

        uint256 preAssets = totalAssets() - delta;
        uint256 supply = totalSupply();
        shares = Math.mulDiv(net, supply + 10 ** _decimalsOffset(), preAssets + 1, Math.Rounding.Floor);
    }

    /// @notice Claim shares for unaccounted USDC sent to vault Core spot.
    ///         Caller must already have transferred USDC to address(this)
    ///         on Core. Mints shares to `receiver` for the delta against
    ///         `lastSeenCoreSpot`, less optional fee.
    function depositCore(address receiver, uint256 minShares) external returns (uint256 shares) {
        if (receiver == address(0)) revert ZeroAddress();
        _requireStakeWithinCure();

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

        _updateStakeBreachState();
        emit DepositedCore(msg.sender, receiver, delta, fee, shares);
    }

    /// @notice Burn `shares` and send pro-rata Core USDC to `coreReceiver`.
    ///         Redeems are NEVER blocked by stake-breach cure expiry —
    ///         followers must always be able to exit.
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

        _updateStakeBreachState();
        emit Redeemed(msg.sender, coreReceiver, shares, amount);
    }

    // ─── Trading actions (creator-only) ────────────────────────────────────

    function moveOnCore(uint256 amount, bool toPerp) external onlyCreator {
        if (amount == 0) revert ZeroAmount();
        _requireStakeWithinCure();
        // Action 7 `usdClassTransfer` expects amount in 6-dec perp USDC,
        // matching our internal unit — no scaling.
        bytes memory payload = abi.encode(uint64(amount), toPerp);
        _sendAction(HLConstants.ACTION_USD_CLASS_TRANSFER, payload);
        if (toPerp) lastSeenCoreSpot -= amount;
        else lastSeenCoreSpot += amount;
        emit MovedOnCore(amount, toPerp);
    }

    function placeOrder(uint32 asset_, bool isBuy, uint64 limitPx, uint64 sz, bool reduceOnly, uint8 tif)
        external onlyCreator
    {
        _requireStakeWithinCure();
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
