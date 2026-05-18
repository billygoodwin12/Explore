// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

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
contract CreatorVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    address public immutable CREATOR;
    address public immutable CORE_DEPOSIT_WALLET;

    // ─── Stake-invariant parameters ─────────────────────────────
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
    ///         in basis points. **Defaults to `DEPOSIT_TVL_CAP_DISABLED`**
    ///         in PR 3-NEW: the in-flight tracker closes the async-bridge
    ///         sandwich window that the cap was originally introduced (in
    ///         PR 2-NEW) to bound. The cap mechanism is retained as
    ///         defense-in-depth: admin can re-enable on a per-vault basis
    ///         (inside [DEPOSIT_TVL_CAP_BPS_MIN, DEPOSIT_TVL_CAP_BPS_MAX])
    ///         if production observation surfaces issues.
    uint16 public depositTvlCapBps = type(uint16).max; // = DEPOSIT_TVL_CAP_DISABLED
    uint16 public constant DEPOSIT_TVL_CAP_BPS_MIN = 100;    // 1%
    uint16 public constant DEPOSIT_TVL_CAP_BPS_MAX = 10_000; // 100% (= NAV-sized)
    uint16 public constant DEPOSIT_TVL_CAP_DISABLED = type(uint16).max;

    // ─── In-flight bridge tracker (PR 3-NEW) ────────────────────────────
    /// @notice One pending entry per bridge fired from `_doDeposit` or
    ///         `sweepStrandedEvmUsdc`. `enqueueBlock` lets the time-based
    ///         fallback identify entries old enough to consider settled
    ///         (or silently failed) without further on-chain evidence.
    struct PendingBridge {
        uint128 amount;       // 6-dec USDC, fits comfortably (max 3.4e38)
        uint64  enqueueBlock; // block.number when bridge fired
    }

    /// @notice Append-only FIFO queue. Live entries are
    ///         `pending[pendingStart .. pending.length - 1]`. We never
    ///         shift the array — `pendingStart` advances as entries
    ///         settle or expire. Old slots are abandoned (cheap on
    ///         HyperEVM); periodic compaction is a future optimization
    ///         only if monitoring shows `pending.length` growing into
    ///         millions.
    PendingBridge[] internal pending;
    uint256 internal pendingStart;

    /// @notice Sum of `pending[pendingStart..].amount`. Counted in
    ///         `totalAssets()` so subsequent deposits price against the
    ///         post-bridge NAV during the settlement window, closing the
    ///         async-bridge sandwich window.
    uint256 public pendingBridgedUsdc;

    /// @notice High-water mark of `_coreSpotUSDC()` observed at the most
    ///         recent `_settlePending` call. Growth above this checkpoint
    ///         drives observation-based settlement detection.
    uint256 internal lastCheckedCoreSpot;

    /// @notice Tracks expected Core-spot inflow from `moveOnCore(toPerp=false)`
    ///         that hasn't yet settled. Decremented by the same observation
    ///         logic as `pendingBridgedUsdc`, but consumed *first* so the
    ///         tracker doesn't misattribute perp→spot moves as bridge
    ///         settlements. Wired in commit 3; defined here so storage
    ///         layout is locked.
    uint256 internal inFlightFromPerp;

    /// @notice Time-based fallback for settlement. Sized at 100 blocks
    ///         (~100s) against empirically-measured cross-block latency
    ///         of 0 blocks across 3 mainnet probes — see INVESTIGATION
    ///         §11.6. Observation-based detection is the primary
    ///         mechanism; this is the silent-failure safety net.
    uint256 public constant SETTLEMENT_BLOCKS_FALLBACK = 100;

    // ─── Time-locked admin operations (PR 4) ────────────────────────────
    /// @notice Per-function delay constants. Different operations have
    ///         different blast radii, hence different delays. See
    ///         `PR4_DESIGN_NOTES.md` for rationale.
    uint256 public constant FEE_CHANGE_DELAY         = 24 hours;
    uint256 public constant TVL_CAP_CHANGE_DELAY     = 24 hours;
    uint256 public constant BUILDER_FEE_CHANGE_DELAY = 24 hours;
    uint256 public constant STAKE_CAP_CHANGE_DELAY   = 7 days;

    /// @notice Pending admin changes. `executableAt == 0` is the
    ///         sentinel for "no pending change for this parameter".
    ///         At most one pending change per parameter at any time;
    ///         admin must `cancelPending<X>` an existing proposal
    ///         before re-proposing.
    struct PendingFeeChange {
        uint16  newBps;
        address newRecipient;
        uint64  executableAt;
    }
    PendingFeeChange public pendingFeeChange;

    struct PendingStakeCap {
        uint256 newCap;
        uint64  executableAt;
    }
    PendingStakeCap public pendingStakeCap;

    struct PendingTvlCap {
        uint16 newBps;
        uint64 executableAt;
    }
    PendingTvlCap public pendingTvlCap;

    struct PendingBuilderFee {
        address builder;
        uint64  maxFeeRate;
        uint64  executableAt;
    }
    PendingBuilderFee public pendingBuilderFee;

    event PendingBridgeEnqueued(uint128 amount, uint64 enqueueBlock);
    event PendingBridgeSettled(uint256 amountSettled, uint256 pendingStartAfter);
    event PendingBridgeExpired(uint256 amountExpired, uint256 pendingStartAfter);

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

    event DepositFeeChangeProposed(uint16 newBps, address newRecipient, uint64 executableAt);
    event DepositFeeChangeExecuted(uint16 newBps, address newRecipient);
    event DepositFeeChangeCancelled(uint16 newBps, address newRecipient);

    event StakeCapChangeProposed(uint256 newCap, uint64 executableAt);
    event StakeCapChangeExecuted(uint256 newCap);
    event StakeCapChangeCancelled(uint256 newCap);

    event TvlCapChangeProposed(uint16 newBps, uint64 executableAt);
    event TvlCapChangeExecuted(uint16 newBps);
    event TvlCapChangeCancelled(uint16 newBps);

    event BuilderFeeChangeProposed(address builder, uint64 maxFeeRate, uint64 executableAt);
    event BuilderFeeChangeExecuted(address builder, uint64 maxFeeRate);
    event BuilderFeeChangeCancelled(address builder, uint64 maxFeeRate);

    error UseCoreRedeem();
    error DepositBelowMinimum(uint256 assets, uint256 floor);
    error DepositExceedsTvlCap(uint256 assets, uint256 cap);
    error VaultNotActivated();
    error SharesRoundToZero();
    error NoSupply();
    error SlippageExceeded(uint256 got, uint256 min);
    /// @notice Redeem computed to zero asset amount. Happens when the
    ///         caller's share count is tiny relative to current vault
    ///         NAV / supply (dust-shares case after a large dilution).
    ///         Caller should redeem more shares.
    error RedeemAmountZero();
    /// @notice Redeem amount exceeds Core spot, but the shortfall is
    ///         covered by `pendingBridgedUsdc` (in-flight bridges from
    ///         recent deposits). Caller should retry after settlement.
    /// @param spotAvailable Current Core spot USDC (6-dec).
    /// @param amountRequested Asset amount the redeem would withdraw.
    /// @param pendingInflight Total in-flight bridges right now.
    /// @param estimatedBlocksUntilSettlement Upper bound on blocks the
    ///         caller may need to wait before retrying. Computed as
    ///         `SETTLEMENT_BLOCKS_FALLBACK - age_of_oldest_pending`.
    ///         Actual settlement is typically much faster — sub-block in
    ///         observed mainnet probes (INVESTIGATION §11.6). The bound
    ///         is the worst-case fallback time; treat as "wait up to N
    ///         blocks" not "wait exactly N blocks."
    error RedeemPendingSettlement(
        uint256 spotAvailable,
        uint256 amountRequested,
        uint256 pendingInflight,
        uint256 estimatedBlocksUntilSettlement
    );
    /// @notice Redeem amount exceeds Core spot, but creator has open perp
    ///         positions that account for the shortfall. Creator must close
    ///         positions (or `moveOnCore` perp→spot) before this redeem fits.
    error RedeemPerpPositionsOpen(uint256 spotAvailable, uint256 amountRequested, uint256 perpAccountValue);
    /// @notice Redeem amount exceeds settled assets; vault is genuinely
    ///         under-capitalized. Should not happen in normal operation.
    error RedeemInsufficient(uint256 spotAvailable, uint256 amountRequested);
    error StakeCureExpired(uint256 breachStartedAt, uint256 elapsedSeconds);
    error CapOutOfBounds(uint256 newCap, uint256 minCap, uint256 maxCap);
    error TvlCapBpsOutOfBounds(uint16 newBps, uint16 minBps, uint16 maxBps);
    error DepositFeeTooHigh(uint16 bps, uint16 cap);
    /// @notice `setDepositFee` rejects nonzero bps with a zero recipient
    ///         (would silently disable the fee in `_splitFee` — surface it
    ///         explicitly so admin misconfigurations are caught at the call).
    error FeeConfigInvalid(uint16 bps, address recipient);
    error PrecompileFailed(address precompile);
    error NotCreator();
    error ZeroAmount();
    error ZeroAddress();
    /// @notice `execute<X>` called before `block.timestamp` reached
    ///         the proposal's `executableAt`.
    error TimelockNotElapsed(uint64 executableAt, uint64 currentTime);
    /// @notice `execute<X>` or `cancelPending<X>` called when no
    ///         proposal exists (`executableAt == 0`).
    error NoPendingChange();
    /// @notice `propose<X>` called while a proposal is already in
    ///         flight for the same parameter. Admin must cancel the
    ///         existing proposal first.
    error PendingChangeExists(uint64 executableAt);

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

    // ─── Asset accounting ───────────────────────────────────────────
    /// @notice Vault NAV in 6-dec USDC. Includes Core spot + perp +
    ///         `pendingBridgedUsdc` (in-flight bridges from prior
    ///         deposits whose Core credit has not been observed yet).
    ///         Counting pending closes the async-bridge sandwich window:
    ///         a deposit landing during another deposit's settlement
    ///         interval prices against the post-bridge NAV, not the
    ///         stale Core-only value. See `_settlePending` for the
    ///         settlement-detection logic that drains pending.
    function totalAssets() public view override returns (uint256) {
        return _coreSpotUSDC() + _corePerpAccountValue() + pendingBridgedUsdc;
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

    // ─── ERC-4626 limits + previews ───────────────────────────────────
    /// @notice maxDeposit reflects:
    ///         - 0 if vault not activated (Core spot == 0) — would revert.
    ///         - 0 if deposits are closed (post-cure-period).
    ///         - type(uint256).max if cap is disabled.
    ///         - max(NAV × cap_bps / 10_000, MIN_DEPOSIT_USDC) otherwise.
    ///           The floor lets bootstrap deposits succeed when 5% of a
    ///           small post-activation NAV would otherwise be below the
    ///           minimum deposit.
    function maxDeposit(address) public view override returns (uint256) {
        if (!_depositsOpen()) return 0;
        if (_coreSpotUSDC() == 0) return 0;
        if (depositTvlCapBps == DEPOSIT_TVL_CAP_DISABLED) return type(uint256).max;
        uint256 cap = Math.mulDiv(totalAssets(), depositTvlCapBps, 10_000);
        return cap < MIN_DEPOSIT_USDC ? MIN_DEPOSIT_USDC : cap;
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

    // ─── ERC-4626 mutators ─────────────────────────────────────────

    /// @notice Standard ERC-4626 deposit. Pulls `assets` USDC on EVM,
    ///         skims optional fee, bridges net to vault Core spot via
    ///         `CoreDepositWallet.depositFor`, mints shares.
    ///
    /// @dev    Share pricing uses `totalAssets()` BEFORE the bridge
    ///         settles — i.e. excludes the in-flight `net` amount. This
    ///         is intentional: it preserves ERC-4626 invariants against
    ///         the observable Core state. Sandwich-window risk during the
    ///         settlement interval is bounded by the per-tx TVL cap.
    function deposit(uint256 assets, address receiver) public override nonReentrant returns (uint256 shares) {
        return _doDeposit(assets, receiver);
    }

    /// @notice Standard ERC-4626 mint. Computes gross USDC, then routes
    ///         through the shared deposit pathway. Returns the gross asset
    ///         amount used.
    function mint(uint256 shares, address receiver) public override nonReentrant returns (uint256 assets) {
        assets = previewMint(shares);
        _doDeposit(assets, receiver);
    }

    /// @dev Shared deposit logic. Internal to allow `mint` to reuse it
    ///      without double-tripping the `nonReentrant` guard (OZ's guard
    ///      blocks same-contract reentry, so the public `mint` and `deposit`
    ///      can't call each other directly).
    ///
    ///      Tracker invariants:
    ///      - `_settlePending()` at entry ensures `pendingBridgedUsdc`
    ///        reflects only genuinely in-flight bridges (drains any prior
    ///        deposits whose Core credit has now landed). Without this, the
    ///        share calculation at step 5 would double-count settled bridges
    ///        (once in `coreSpot`, once in `pendingBridgedUsdc`).
    ///      - `_enqueuePending(net)` after `_bridgeToCore` and before
    ///        `_mint` + `_updateStakeBreachState` ensures the post-deposit
    ///        NAV includes this deposit's contribution. Eliminates
    ///        KNOWN_ISSUES §2's transient false-positive breach event.
    function _doDeposit(uint256 assets, address receiver) internal returns (uint256 shares) {
        _settlePending();

        if (assets < MIN_DEPOSIT_USDC) revert DepositBelowMinimum(assets, MIN_DEPOSIT_USDC);
        if (receiver == address(0)) revert ZeroAddress();
        _requireStakeWithinCure();

        // Vault must be pre-activated. CDW charges a 1 USDC newCoreAccountFee
        // on the first inbound to a fresh Core account; if we let user deposits
        // pay it, the first depositor silently dilutes everyone. Admin must
        // send ≥2 USDC directly to the vault's Core spot before opening
        // deposits — see README "Deployment runbook" + INVESTIGATION §11.4.
        if (_coreSpotUSDC() == 0) revert VaultNotActivated();

        // Per-tx TVL cap (sandwich-window interim mitigation). Floor of
        // MIN_DEPOSIT_USDC so bootstrap can proceed even when 5% of NAV
        // would otherwise be below the minimum deposit.
        uint16 capBps = depositTvlCapBps;
        if (capBps != DEPOSIT_TVL_CAP_DISABLED) {
            uint256 cap = Math.mulDiv(totalAssets(), capBps, 10_000);
            if (cap < MIN_DEPOSIT_USDC) cap = MIN_DEPOSIT_USDC;
            if (assets > cap) revert DepositExceedsTvlCap(assets, cap);
        }

        IERC20 token = IERC20(asset());
        token.safeTransferFrom(msg.sender, address(this), assets);

        (uint256 fee, uint256 net) = _splitFee(assets);
        shares = _sharesForNet(net);
        if (shares == 0) revert SharesRoundToZero();

        if (fee > 0) token.safeTransfer(feeRecipient, fee);
        _bridgeToCore(token, net);
        _enqueuePending(net);

        _mint(receiver, shares);
        _updateStakeBreachState();
        emit Deposited(msg.sender, receiver, assets, fee, shares);
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
    function sweepStrandedEvmUsdc() external nonReentrant {
        _settlePending();
        IERC20 token = IERC20(asset());
        uint256 balance = token.balanceOf(address(this));
        if (balance == 0) return;
        _bridgeToCore(token, balance);
        _enqueuePending(balance);
        emit StrandedUsdcSwept(balance);
    }

    // ─── Stake-invariant views + state machine ─────────────────────────────
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

    // ─── Core-side redeem ────────────────────────────────────────────
    /// @notice Burn `shares` and spotSend pro-rata Core USDC to
    ///         `coreReceiver`. Never gated by stake-cure expiry.
    function redeemCore(uint256 shares, address coreReceiver) external nonReentrant returns (uint256 amount) {
        _settlePending();

        if (shares == 0) revert ZeroAmount();
        if (coreReceiver == address(0)) revert ZeroAddress();

        uint256 supply = totalSupply();
        if (supply == 0) revert NoSupply();

        amount = Math.mulDiv(shares, totalAssets() + 1, supply + 10 ** _decimalsOffset(), Math.Rounding.Floor);
        // Dust-shares: ratio rounds to zero against current NAV / supply.
        // Surface explicitly so callers know to redeem a larger amount.
        if (amount == 0) revert RedeemAmountZero();

        uint256 spot = _coreSpotUSDC();
        if (spot < amount) {
            // Structured shortfall cascade:
            //   1. Shortfall covered by pending bridges → caller retries.
            //   2. Shortfall covered by perp value → creator action needed.
            //   3. Vault truly under-capitalized → hard error.
            uint256 pendingNow = pendingBridgedUsdc;
            if (spot + pendingNow >= amount) {
                // Oldest pending entry's age determines worst-case wait.
                uint256 ageBlocks = block.number - pending[pendingStart].enqueueBlock;
                uint256 blocksLeft = ageBlocks < SETTLEMENT_BLOCKS_FALLBACK
                    ? SETTLEMENT_BLOCKS_FALLBACK - ageBlocks
                    : 0;
                revert RedeemPendingSettlement(spot, amount, pendingNow, blocksLeft);
            }
            uint256 perpValue = _corePerpAccountValue();
            if (spot + perpValue >= amount) {
                revert RedeemPerpPositionsOpen(spot, amount, perpValue);
            }
            revert RedeemInsufficient(spot, amount);
        }

        _burn(msg.sender, shares);
        _spotSendCore(coreReceiver, amount);

        _updateStakeBreachState();
        emit Redeemed(msg.sender, coreReceiver, shares, amount);
    }

    // ─── Trading actions (creator-only) ───────────────────────────────────
    function moveOnCore(uint256 amount, bool toPerp) external onlyCreator nonReentrant {
        _settlePending();
        if (amount == 0) revert ZeroAmount();
        _requireStakeWithinCure();
        bytes memory payload = abi.encode(amount.toUint64(), toPerp);
        _sendAction(HLConstants.ACTION_USD_CLASS_TRANSFER, payload);
        if (!toPerp) {
            // Track expected Core-spot inflow so the next `_settlePending`
            // doesn't misattribute it as a bridge settlement and drain
            // `pendingBridgedUsdc` incorrectly.
            inFlightFromPerp += amount;
        }
        emit MovedOnCore(amount, toPerp);
    }

    function placeOrder(uint32 asset_, bool isBuy, uint64 limitPx, uint64 sz, bool reduceOnly, uint8 tif)
        external onlyCreator nonReentrant
    {
        _settlePending();
        _requireStakeWithinCure();
        bytes memory payload = abi.encode(asset_, isBuy, limitPx, sz, reduceOnly, tif, uint128(0));
        _sendAction(HLConstants.ACTION_LIMIT_ORDER, payload);
        emit OrderPlaced(asset_, isBuy, limitPx, sz, tif);
    }

    // ─── Time-locked admin: propose / execute / cancel (PR 4) ───────────────
    // All four admin parameter changes go through propose + execute, gated by
    // per-function delays. See PR4_DESIGN_NOTES.md for rationale.

    function proposeDepositFeeChange(uint16 newBps, address newRecipient) external onlyOwner {
        if (pendingFeeChange.executableAt != 0) {
            revert PendingChangeExists(pendingFeeChange.executableAt);
        }
        if (newBps > MAX_DEPOSIT_FEE_BPS) revert DepositFeeTooHigh(newBps, MAX_DEPOSIT_FEE_BPS);
        if (newBps > 0 && newRecipient == address(0)) revert FeeConfigInvalid(newBps, newRecipient);
        if (newBps == 0 && newRecipient != address(0)) revert FeeConfigInvalid(newBps, newRecipient);

        uint64 executableAt = uint64(block.timestamp + FEE_CHANGE_DELAY);
        pendingFeeChange = PendingFeeChange({
            newBps: newBps,
            newRecipient: newRecipient,
            executableAt: executableAt
        });
        emit DepositFeeChangeProposed(newBps, newRecipient, executableAt);
    }
    function executeDepositFeeChange() external onlyOwner {
        PendingFeeChange memory p = pendingFeeChange;
        if (p.executableAt == 0) revert NoPendingChange();
        if (block.timestamp < p.executableAt) {
            revert TimelockNotElapsed(p.executableAt, uint64(block.timestamp));
        }

        depositFeeBps = p.newBps;
        feeRecipient = p.newRecipient;
        delete pendingFeeChange;

        emit DepositFeeUpdated(p.newBps, p.newRecipient);
        emit DepositFeeChangeExecuted(p.newBps, p.newRecipient);
    }
    /// @notice Permissionless cancel of a pending fee change. Defense
    ///         against admin-key compromise queuing a hostile fee
    ///         increase during the 24h window — any observer can abort.
    ///         Griefing risk (random user cancels legitimate proposal)
    ///         is bounded: admin re-proposes and waits another 24h.
    function cancelPendingFeeChange() external {
        PendingFeeChange memory p = pendingFeeChange;
        if (p.executableAt == 0) revert NoPendingChange();
        delete pendingFeeChange;
        emit DepositFeeChangeCancelled(p.newBps, p.newRecipient);
    }

    function proposeStakeCapChange(uint256 newCap) external onlyOwner {
        if (pendingStakeCap.executableAt != 0) {
            revert PendingChangeExists(pendingStakeCap.executableAt);
        }
        if (newCap < CREATOR_STAKE_CAP_MIN || newCap > CREATOR_STAKE_CAP_MAX) {
            revert CapOutOfBounds(newCap, CREATOR_STAKE_CAP_MIN, CREATOR_STAKE_CAP_MAX);
        }

        uint64 executableAt = uint64(block.timestamp + STAKE_CAP_CHANGE_DELAY);
        pendingStakeCap = PendingStakeCap({newCap: newCap, executableAt: executableAt});
        emit StakeCapChangeProposed(newCap, executableAt);
    }
    function executeStakeCapChange() external onlyOwner {
        PendingStakeCap memory p = pendingStakeCap;
        if (p.executableAt == 0) revert NoPendingChange();
        if (block.timestamp < p.executableAt) {
            revert TimelockNotElapsed(p.executableAt, uint64(block.timestamp));
        }

        uint256 old = creatorStakeCapUsdc;
        creatorStakeCapUsdc = p.newCap;
        delete pendingStakeCap;

        emit StakeCapUpdated(old, p.newCap);
        emit StakeCapChangeExecuted(p.newCap);
    }
    /// @notice Permissionless cancel — see `cancelPendingFeeChange` for
    ///         rationale (defense against admin-key compromise).
    function cancelPendingStakeCapChange() external {
        PendingStakeCap memory p = pendingStakeCap;
        if (p.executableAt == 0) revert NoPendingChange();
        delete pendingStakeCap;
        emit StakeCapChangeCancelled(p.newCap);
    }

    function proposeTvlCapChange(uint16 newBps) external onlyOwner {
        if (pendingTvlCap.executableAt != 0) {
            revert PendingChangeExists(pendingTvlCap.executableAt);
        }
        bool inRange = newBps >= DEPOSIT_TVL_CAP_BPS_MIN && newBps <= DEPOSIT_TVL_CAP_BPS_MAX;
        if (!inRange && newBps != DEPOSIT_TVL_CAP_DISABLED) {
            revert TvlCapBpsOutOfBounds(newBps, DEPOSIT_TVL_CAP_BPS_MIN, DEPOSIT_TVL_CAP_BPS_MAX);
        }

        uint64 executableAt = uint64(block.timestamp + TVL_CAP_CHANGE_DELAY);
        pendingTvlCap = PendingTvlCap({newBps: newBps, executableAt: executableAt});
        emit TvlCapChangeProposed(newBps, executableAt);
    }
    function executeTvlCapChange() external onlyOwner {
        PendingTvlCap memory p = pendingTvlCap;
        if (p.executableAt == 0) revert NoPendingChange();
        if (block.timestamp < p.executableAt) {
            revert TimelockNotElapsed(p.executableAt, uint64(block.timestamp));
        }

        uint16 old = depositTvlCapBps;
        depositTvlCapBps = p.newBps;
        delete pendingTvlCap;

        emit DepositTvlCapUpdated(old, p.newBps);
        emit TvlCapChangeExecuted(p.newBps);
    }
    /// @notice Permissionless cancel — see `cancelPendingFeeChange` for
    ///         rationale.
    function cancelPendingTvlCapChange() external {
        PendingTvlCap memory p = pendingTvlCap;
        if (p.executableAt == 0) revert NoPendingChange();
        delete pendingTvlCap;
        emit TvlCapChangeCancelled(p.newBps);
    }

    function proposeBuilderFeeChange(address builder, uint64 maxFeeRate) external onlyOwner {
        if (pendingBuilderFee.executableAt != 0) {
            revert PendingChangeExists(pendingBuilderFee.executableAt);
        }

        uint64 executableAt = uint64(block.timestamp + BUILDER_FEE_CHANGE_DELAY);
        pendingBuilderFee = PendingBuilderFee({
            builder: builder,
            maxFeeRate: maxFeeRate,
            executableAt: executableAt
        });
        emit BuilderFeeChangeProposed(builder, maxFeeRate, executableAt);
    }
    function executeBuilderFeeChange() external onlyOwner nonReentrant {
        PendingBuilderFee memory p = pendingBuilderFee;
        if (p.executableAt == 0) revert NoPendingChange();
        if (block.timestamp < p.executableAt) {
            revert TimelockNotElapsed(p.executableAt, uint64(block.timestamp));
        }

        _settlePending();
        delete pendingBuilderFee;

        bytes memory payload = abi.encode(p.maxFeeRate, p.builder);
        _sendAction(HLConstants.ACTION_APPROVE_BUILDER_FEE, payload);

        emit BuilderApproved(p.builder, p.maxFeeRate);
        emit BuilderFeeChangeExecuted(p.builder, p.maxFeeRate);
    }
    /// @notice Permissionless cancel — see `cancelPendingFeeChange` for
    ///         rationale.
    function cancelPendingBuilderFeeChange() external {
        PendingBuilderFee memory p = pendingBuilderFee;
        if (p.executableAt == 0) revert NoPendingChange();
        delete pendingBuilderFee;
        emit BuilderFeeChangeCancelled(p.builder, p.maxFeeRate);
    }

    // ─── Internals ─────────────────────────────────────────────────
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
        // amount6 (6-dec USDC) × 100 → 8-dec native. SafeCast surfaces
        // overflow at the boundary rather than silently truncating.
        uint64 amount8 = (amount6 * 100).toUint64();
        bytes memory payload = abi.encode(coreReceiver, HLConstants.USDC_SPOT_INDEX, amount8);
        _sendAction(HLConstants.ACTION_SPOT_SEND, payload);
    }

    function _sendAction(uint24 actionId, bytes memory payload) internal {
        bytes memory data = bytes.concat(bytes1(0x01), bytes3(actionId), payload);
        ICoreWriter(HLConstants.CORE_WRITER).sendRawAction(data);
    }

    // ─── In-flight tracker: settlement detection ───────────────────────────
    /// @notice Consume Core-spot growth since the last checkpoint:
    ///         1. First, reserve any growth that corresponds to a pending
    ///            `moveOnCore(toPerp=false)` inflow — those don't drain
    ///            pending bridges.
    ///         2. Remaining growth drains pending entries oldest-first
    ///            (observation-based settlement).
    ///         3. Walk pending from the head and hard-expire entries
    ///            older than `SETTLEMENT_BLOCKS_FALLBACK` (silent-failure
    ///            safety net).
    ///         4. Update `lastCheckedCoreSpot` to the current observed value.
    ///
    /// @dev Iteration is bounded by live entries (`pending.length - pendingStart`),
    ///      which in practice is the number of unsettled bridges within
    ///      the fallback window. Realistic cap: ~tens of entries.
    function _settlePending() internal {
        uint256 currentSpot = _coreSpotUSDC();
        uint256 grew = currentSpot > lastCheckedCoreSpot
            ? currentSpot - lastCheckedCoreSpot
            : 0;

        // Step 1: reserve perp→spot inflows.
        if (grew > 0 && inFlightFromPerp > 0) {
            uint256 reserved = grew < inFlightFromPerp ? grew : inFlightFromPerp;
            inFlightFromPerp -= reserved;
            grew -= reserved;
        }

        // Step 2: observation-based settlement (oldest first).
        if (grew > 0) {
            uint256 i = pendingStart;
            uint256 endIdx = pending.length;
            uint256 settled = 0;
            while (i < endIdx && grew > 0) {
                PendingBridge storage entry = pending[i];
                if (entry.amount <= grew) {
                    grew -= entry.amount;
                    settled += entry.amount;
                    i++;
                } else {
                    entry.amount -= uint128(grew);
                    settled += grew;
                    grew = 0;
                }
            }
            if (settled > 0) {
                pendingBridgedUsdc -= settled;
                pendingStart = i;
                emit PendingBridgeSettled(settled, pendingStart);
            }
        }

        // Step 3: time-based fallback expiry (silent-failure safety net).
        uint256 cutoff = block.number > SETTLEMENT_BLOCKS_FALLBACK
            ? block.number - SETTLEMENT_BLOCKS_FALLBACK
            : 0;
        uint256 j = pendingStart;
        uint256 endLen = pending.length;
        uint256 expired = 0;
        while (j < endLen && pending[j].enqueueBlock <= cutoff) {
            expired += pending[j].amount;
            j++;
        }
        if (expired > 0) {
            pendingBridgedUsdc -= expired;
            pendingStart = j;
            emit PendingBridgeExpired(expired, pendingStart);
        }

        lastCheckedCoreSpot = currentSpot;
    }

    /// @notice Append a new pending bridge entry. Called by `_doDeposit`
    ///         and `sweepStrandedEvmUsdc` immediately after `_bridgeToCore`
    ///         and before `_mint` / `_updateStakeBreachState`, so that
    ///         `totalAssets()` includes this bridge's contribution when
    ///         the breach check runs (eliminates KNOWN_ISSUES §2's
    ///         transient false-positive).
    function _enqueuePending(uint256 amount) internal {
        uint128 amount128 = amount.toUint128();
        pending.push(PendingBridge({
            amount: amount128,
            enqueueBlock: uint64(block.number)
        }));
        pendingBridgedUsdc += amount;
        emit PendingBridgeEnqueued(amount128, uint64(block.number));
    }
}
