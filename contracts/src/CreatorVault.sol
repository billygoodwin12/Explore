// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {HLConstants, ICoreWriter, ICoreDepositWallet} from "./HLConstants.sol";

/// @title  CreatorVault — Theorise PR 2-NEW (inline-bridge EVM-deposit)
/// @notice Creator-led vault. Followers deposit USDC on HyperEVM via the
///         standard ERC-4626 surface; `deposit()` / `mint()` pull USDC,
///         skim optional fee, then bridge the net inline to the vault's
///         Core spot account via Circle's `CoreDepositWallet.depositFor`.
///         Shares are minted against `totalAssets()` (Core spot + perp
///         accountValue) observed BEFORE the bridge settles on Core.
///
///         The bridge mechanism is the canonical pattern used by
///         production HL protocols (Monetrix, hyper-evm-lib, Circle's
///         CCTP forwarder). Direct `transfer(USDC_SYSTEM_ADDRESS, …)`
///         from a contract reverts with Circle's `Blacklistable` on both
///         networks; `CoreDepositWallet` wraps the system-address
///         transfer so contract callers can bridge.
///
///         Redemption stays Core-side (`redeemCore`): pro-rata Core USDC
///         spotSent to the follower's address. EVM-side `withdraw`/`redeem`
///         revert (use `redeemCore`).
///
///         Creator-stake invariant unchanged from PR 1: creator must hold
///         `min(MIN_CREATOR_BPS of totalAssets, creatorStakeCapUsdc)`. Below
///         the floor, a 48h cure period starts during which creator-side
///         actions still work; after expiry, deposits + creator trading
///         halt while redemptions remain open.
///
///         Async-bridge sandwich window: when two deposits land before
///         the first bridge settles on Core, the second prices against
///         stale `totalAssets()`. Interim mitigation: per-tx cap at
///         `DEPOSIT_TVL_CAP_BPS` of TVL (default 5%), bounding exploit
///         lift to that fraction. See KNOWN_ISSUES.md.
contract CreatorVault is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    address public immutable CREATOR;
    address public immutable CORE_DEPOSIT_WALLET;

    // ─── Stake-invariant parameters ──────────────────────────────
    uint16  public constant MIN_CREATOR_BPS         = 500;
    uint256 public constant CREATOR_STAKE_CAP_MIN   = 100_000e6;
    uint256 public constant CREATOR_STAKE_CAP_MAX   = 5_000_000e6;
    uint256 public constant STAKE_CURE_PERIOD       = 48 hours;
    uint256 public creatorStakeCapUsdc;
    uint256 public stakeBreachStartedAt;

    // ─── Deposit fee ──────────────────────────────────────────
    uint16  public depositFeeBps;
    address public feeRecipient;
    uint16  public constant MAX_DEPOSIT_FEE_BPS = 1000;

    // ─── Deposit floor ────────────────────────────────────────
    /// @notice Minimum gross USDC per deposit. Prevents dust-spam +
    ///         shares-round-to-zero edge cases at high TVL.
    uint256 public constant MIN_DEPOSIT_USDC = 10e6; // $10

    // ─── Per-tx TVL cap (interim sandwich-window mitigation) ─────────
    /// @notice Per-tx cap on deposit size as a fraction of `totalAssets()`,
    ///         in basis points. Defaults to 500 (5%). Admin-tunable inside
    ///         [DEPOSIT_TVL_CAP_BPS_MIN, DEPOSIT_TVL_CAP_BPS_MAX], or set
    ///         to `DEPOSIT_TVL_CAP_DISABLED` to skip the check entirely
    ///         (intended for when PR 3-NEW's in-flight tracker lands).
    uint16 public depositTvlCapBps = 500;
    uint16 public constant DEPOSIT_TVL_CAP_BPS_MIN = 100;    // 1%
    uint16 public constant DEPOSIT_TVL_CAP_BPS_MAX = 10_000; // 100% (= NAV-sized)
    uint16 public constant DEPOSIT_TVL_CAP_DISABLED = type(uint16).max;

    event DepositFeeUpdated(uint16 bps, address recipient);
    event Deposited(address indexed caller, address indexed receiver, uint256 assets, uint256 fee, uint256 shares);
    event Redeemed(address indexed owner, address indexed coreReceiver, uint256 shares, uint256 amount);
    event MovedOnCore(uint256 amount, bool toPerp);
    event OrderPlaced(uint32 asset, bool isBuy, uint64 limitPx, uint64 sz, uint8 tif);
    event BuilderApproved(address indexed builder, uint64 maxFeeRate);
    event StrandedUsdcSwept(uint256 amount);
    event StakeBreachStarted(uint256 currentStake, uint256 required, uint256 timestamp);
    event StakeBreachCured(uint256 currentStake, uint256 required, uint256 timestamp);
    event StakeCapUpdated(uint256 oldCap, uint256 newCap);
    event DepositTvlCapUpdated(uint16 oldBps, uint16 newBps);

    error UseCoreRedeem();
    error DepositBelowMinimum(uint256 assets, uint256 floor);
    error DepositExceedsTvlCap(uint256 assets, uint256 cap);
    error SharesRoundToZero();
    error NoSupply();
    error SlippageExceeded(uint256 got, uint256 min);
    error InsufficientSpot(uint256 spot, uint256 needed);
    error StakeCureExpired(uint256 breachStartedAt, uint256 elapsedSeconds);
    error CapOutOfBounds(uint256 newCap, uint256 minCap, uint256 maxCap);
    error TvlCapBpsOutOfBounds(uint16 newBps, uint16 minBps, uint16 maxBps);
    error DepositFeeTooHigh(uint16 bps, uint16 cap);
    error PrecompileFailed(address precompile);
    error NotCreator();
    error ZeroAmount();
    error ZeroAddress();

    modifier onlyCreator() {
        if (msg.sender != CREATOR) revert NotCreator();
        _;
    }

    constructor(
        IERC20 usdc,
        address creator_,
        address admin_,
        address coreDepositWallet_,
        string memory name_,
        string memory symbol_
    ) ERC4626(usdc) ERC20(name_, symbol_) Ownable(admin_) {
        if (creator_ == address(0)) revert ZeroAddress();
        if (coreDepositWallet_ == address(0)) revert ZeroAddress();
        CREATOR = creator_;
        CORE_DEPOSIT_WALLET = coreDepositWallet_;
        creatorStakeCapUsdc = 250_000e6;
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    // ─── Asset accounting ────────────────────────────────────────────
    /// @notice Vault NAV in 6-dec USDC. Reads only Core (spot + perp). Any
    ///         transient EVM USDC sitting between transferFrom and bridge
    ///         is intentionally NOT counted — see `deposit()` for why.
    function totalAssets() public view override returns (uint256) {
        return _coreSpotUSDC() + _corePerpAccountValue();
    }

    function _coreSpotUSDC() internal view returns (uint256) {
        (bool ok, bytes memory data) = HLConstants.SPOT_BALANCE_PRECOMPILE.staticcall(
            abi.encode(address(this), HLConstants.USDC_SPOT_INDEX)
        );
        if (!ok) revert PrecompileFailed(HLConstants.SPOT_BALANCE_PRECOMPILE);
        (uint64 total,,) = abi.decode(data, (uint64, uint64, uint64));
        return uint256(total) / 100;
    }

    function _corePerpAccountValue() internal view returns (uint256) {
        (bool ok, bytes memory data) = HLConstants.ACCOUNT_MARGIN_SUMMARY_PRECOMPILE.staticcall(
            abi.encode(uint32(0), address(this))
        );
        if (!ok) revert PrecompileFailed(HLConstants.ACCOUNT_MARGIN_SUMMARY_PRECOMPILE);
        (int64 accountValue,,,) = abi.decode(data, (int64, uint64, uint64, int64));
        return accountValue > 0 ? uint256(uint64(accountValue)) : 0;
    }

    // ─── ERC-4626 limits + previews ───────────────────────────────────────
    function maxDeposit(address) public view override returns (uint256) {
        if (!_depositsOpen()) return 0;
        uint256 nav = totalAssets();
        if (nav == 0) return type(uint256).max; // bootstrap freely
        if (depositTvlCapBps == DEPOSIT_TVL_CAP_DISABLED) return type(uint256).max;
        return Math.mulDiv(nav, depositTvlCapBps, 10_000);
    }

    function maxMint(address account) public view override returns (uint256) {
        uint256 assetCap = maxDeposit(account);
        if (assetCap == 0) return 0;
        if (assetCap == type(uint256).max) return type(uint256).max;
        return previewDeposit(assetCap);
    }

    /// @notice Withdraw / redeem stay Core-side (use `redeemCore`).
    function maxWithdraw(address) public pure override returns (uint256) { return 0; }
    function maxRedeem(address)   public pure override returns (uint256) { return 0; }

    function previewDeposit(uint256 assets) public view override returns (uint256) {
        (uint256 fee, uint256 net) = _splitFee(assets);
        fee; // silence
        return _sharesForNet(net);
    }

    /// @notice Returns gross USDC required to mint `shares` (i.e. fee'd up).
    function previewMint(uint256 shares) public view override returns (uint256) {
        uint256 net = Math.mulDiv(
            shares,
            totalAssets() + 1,
            totalSupply() + 10 ** _decimalsOffset(),
            Math.Rounding.Ceil
        );
        uint16 bps = depositFeeBps;
        address recip = feeRecipient;
        if (bps > 0 && recip != address(0)) {
            return Math.mulDiv(net, 10_000, 10_000 - bps, Math.Rounding.Ceil);
        }
        return net;
    }

    function previewWithdraw(uint256) public pure override returns (uint256) { revert UseCoreRedeem(); }
    function previewRedeem(uint256)   public pure override returns (uint256) { revert UseCoreRedeem(); }

    // ─── ERC-4626 mutators ────────────────────────────────────────────

    /// @notice Standard ERC-4626 deposit. Pulls `assets` USDC on EVM,
    ///         skims optional fee, bridges net to vault Core spot via
    ///         `CoreDepositWallet.depositFor`, mints shares.
    ///
    /// @dev    Share pricing uses `totalAssets()` BEFORE the bridge
    ///         settles — i.e. excludes the in-flight `net` amount. This
    ///         is intentional: it preserves ERC-4626 invariants against
    ///         the observable Core state. Sandwich-window risk during the
    ///         settlement interval is bounded by the per-tx TVL cap.
    function deposit(uint256 assets, address receiver) public override returns (uint256 shares) {
        if (assets < MIN_DEPOSIT_USDC) revert DepositBelowMinimum(assets, MIN_DEPOSIT_USDC);
        if (receiver == address(0)) revert ZeroAddress();
        _requireStakeWithinCure();

        // Per-tx TVL cap (sandwich-window interim mitigation). Skipped when
        // NAV == 0 to permit bootstrap of the very first depositor, and
        // when admin has set the disabled sentinel.
        uint256 nav = totalAssets();
        uint16 capBps = depositTvlCapBps;
        if (nav > 0 && capBps != DEPOSIT_TVL_CAP_DISABLED) {
            uint256 cap = Math.mulDiv(nav, capBps, 10_000);
            if (assets > cap) revert DepositExceedsTvlCap(assets, cap);
        }

        IERC20 token = IERC20(asset());
        token.safeTransferFrom(msg.sender, address(this), assets);

        (uint256 fee, uint256 net) = _splitFee(assets);
        shares = _sharesForNet(net);
        if (shares == 0) revert SharesRoundToZero();

        if (fee > 0) token.safeTransfer(feeRecipient, fee);
        _bridgeToCore(token, net);

        _mint(receiver, shares);
        _updateStakeBreachState();
        emit Deposited(msg.sender, receiver, assets, fee, shares);
    }

    /// @notice Standard ERC-4626 mint. Computes gross USDC, then routes
    ///         through `deposit`. Returns the gross asset amount used.
    function mint(uint256 shares, address receiver) public override returns (uint256 assets) {
        assets = previewMint(shares);
        deposit(assets, receiver);
    }

    /// @notice EVM-side withdraw is not supported. Use `redeemCore`.
    function withdraw(uint256, address, address) public pure override returns (uint256) {
        revert UseCoreRedeem();
    }

    /// @notice EVM-side redeem is not supported. Use `redeemCore`.
    function redeem(uint256, address, address) public pure override returns (uint256) {
        revert UseCoreRedeem();
    }

    // ─── Sweep stranded EVM USDC ──────────────────────────────────────
    /// @notice Permissionless: bridge any USDC sitting on the vault's
    ///         EVM address to its Core spot account. Restores ERC-4626
    ///         "donations enrich shareholders" semantics — anyone who
    ///         sends USDC directly to the vault contract on EVM can call
    ///         this to push it into the accounted-for Core balance.
    function sweepStrandedEvmUsdc() external {
        IERC20 token = IERC20(asset());
        uint256 balance = token.balanceOf(address(this));
        if (balance == 0) return;
        _bridgeToCore(token, balance);
        emit StrandedUsdcSwept(balance);
    }

    // ─── Stake-invariant views + state machine ──────────────────────────────
    function requiredCreatorStake() external view returns (uint256) {
        return _requiredCreatorStake();
    }

    function isInBreach() external view returns (bool inBreach, uint256 elapsedSeconds) {
        uint256 startedAt = stakeBreachStartedAt;
        if (startedAt == 0) return (false, 0);
        return (true, block.timestamp - startedAt);
    }

    function _requiredCreatorStake() internal view returns (uint256) {
        uint256 percentBased = Math.mulDiv(totalAssets(), MIN_CREATOR_BPS, 10_000);
        return percentBased < creatorStakeCapUsdc ? percentBased : creatorStakeCapUsdc;
    }

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

    function _requireStakeWithinCure() internal view {
        uint256 startedAt = stakeBreachStartedAt;
        if (startedAt == 0) return;
        if (block.timestamp > startedAt + STAKE_CURE_PERIOD) {
            revert StakeCureExpired(startedAt, block.timestamp - startedAt);
        }
    }

    function _depositsOpen() internal view returns (bool) {
        uint256 startedAt = stakeBreachStartedAt;
        if (startedAt == 0) return true;
        return block.timestamp <= startedAt + STAKE_CURE_PERIOD;
    }

    // ─── Admin: fee + cap + TVL cap ─────────────────────────────────────────
    function setDepositFee(uint16 bps, address recipient) external onlyOwner {
        if (bps > MAX_DEPOSIT_FEE_BPS) revert DepositFeeTooHigh(bps, MAX_DEPOSIT_FEE_BPS);
        depositFeeBps = bps;
        feeRecipient = recipient;
        emit DepositFeeUpdated(bps, recipient);
    }

    function setCreatorStakeCap(uint256 newCap) external onlyOwner {
        if (newCap < CREATOR_STAKE_CAP_MIN || newCap > CREATOR_STAKE_CAP_MAX) {
            revert CapOutOfBounds(newCap, CREATOR_STAKE_CAP_MIN, CREATOR_STAKE_CAP_MAX);
        }
        uint256 old = creatorStakeCapUsdc;
        creatorStakeCapUsdc = newCap;
        emit StakeCapUpdated(old, newCap);
    }

    function setDepositTvlCapBps(uint16 newBps) external onlyOwner {
        bool inRange =
            newBps >= DEPOSIT_TVL_CAP_BPS_MIN && newBps <= DEPOSIT_TVL_CAP_BPS_MAX;
        if (!inRange && newBps != DEPOSIT_TVL_CAP_DISABLED) {
            revert TvlCapBpsOutOfBounds(newBps, DEPOSIT_TVL_CAP_BPS_MIN, DEPOSIT_TVL_CAP_BPS_MAX);
        }
        emit DepositTvlCapUpdated(depositTvlCapBps, newBps);
        depositTvlCapBps = newBps;
    }

    // ─── Core-side redeem ───────────────────────────────────────────────
    /// @notice Burn `shares` and spotSend pro-rata Core USDC to
    ///         `coreReceiver`. Never gated by stake-cure expiry.
    function redeemCore(uint256 shares, address coreReceiver) external returns (uint256 amount) {
        if (shares == 0) revert ZeroAmount();
        if (coreReceiver == address(0)) revert ZeroAddress();

        uint256 supply = totalSupply();
        if (supply == 0) revert NoSupply();

        amount = Math.mulDiv(shares, totalAssets() + 1, supply + 10 ** _decimalsOffset(), Math.Rounding.Floor);

        uint256 spot = _coreSpotUSDC();
        if (spot < amount) revert InsufficientSpot(spot, amount);

        _burn(msg.sender, shares);
        _spotSendCore(coreReceiver, amount);

        _updateStakeBreachState();
        emit Redeemed(msg.sender, coreReceiver, shares, amount);
    }

    // ─── Trading actions (creator-only) ────────────────────────────────────
    function moveOnCore(uint256 amount, bool toPerp) external onlyCreator {
        if (amount == 0) revert ZeroAmount();
        _requireStakeWithinCure();
        bytes memory payload = abi.encode(uint64(amount), toPerp);
        _sendAction(HLConstants.ACTION_USD_CLASS_TRANSFER, payload);
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

    // ─── Internals ────────────────────────────────────────────────────
    function _splitFee(uint256 assets) internal view returns (uint256 fee, uint256 net) {
        uint16 bps = depositFeeBps;
        address recip = feeRecipient;
        fee = (bps > 0 && recip != address(0)) ? Math.mulDiv(assets, bps, 10_000) : 0;
        net = assets - fee;
    }

    function _sharesForNet(uint256 net) internal view returns (uint256) {
        return Math.mulDiv(
            net,
            totalSupply() + 10 ** _decimalsOffset(),
            totalAssets() + 1,
            Math.Rounding.Floor
        );
    }

    /// @notice Bridge `amount` USDC from vault EVM balance to vault Core
    ///         spot via Circle's CoreDepositWallet. Canonical pattern.
    function _bridgeToCore(IERC20 token, uint256 amount) internal {
        token.forceApprove(CORE_DEPOSIT_WALLET, amount);
        ICoreDepositWallet(CORE_DEPOSIT_WALLET).depositFor(
            address(this),
            amount,
            HLConstants.CDW_DESTINATION_SPOT
        );
    }

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
