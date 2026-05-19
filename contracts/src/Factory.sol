// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {CreatorVault} from "./CreatorVault.sol";
import {HLConstants, ICoreDepositWallet} from "./HLConstants.sol";

/// @notice Factory for deploying CreatorVault instances. Enforces
///         username uniqueness (case-insensitive, locked at deploy),
///         performs atomic creator-stake deposit at deploy time,
///         and absorbs the 1 USDC newCoreAccountFee per vault from
///         a protocol-funded float. See FACTORY_DESIGN_NOTES.md for
///         the design rationale and PR 5 commit map.
contract Factory is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Immutables ────────────────────────────────────────────────
    IERC20  public immutable USDC;
    address public immutable CORE_DEPOSIT_WALLET;
    address public immutable PROTOCOL_ADMIN;

    // ─── Constants ─────────────────────────────────────────────────
    uint256 public constant MIN_INITIAL_STAKE_USDC   = 1000e6; // $1,000 spam guard
    uint256 public constant MIN_USERNAME_LENGTH      = 3;
    uint256 public constant MAX_USERNAME_LENGTH      = 30;
    uint256 public constant NEW_CORE_ACCOUNT_FEE_USDC = 1e6;   // 1 USDC absorbed per vault
    uint256 public constant FLOAT_WITHDRAWAL_DELAY    = 7 days;
    /// @notice Delay constants for PR 6c admin operations.
    ///         Treasury (7d) carries the highest blast radius — it's the
    ///         destination for every protocol revenue stream. Deployment
    ///         fee (24h) is a pricing knob, same tier as PR 4 fee/TVL.
    uint256 public constant TREASURY_CHANGE_DELAY      = 7 days;
    uint256 public constant DEPLOYMENT_FEE_CHANGE_DELAY = 24 hours;
    /// @notice PR 6b: deposit-fee default and cap both timelocked at 24h.
    ///         Same tier as DEPLOYMENT_FEE_CHANGE_DELAY -- pricing knobs,
    ///         not asset-extraction operations.
    uint256 public constant DEPOSIT_FEE_DEFAULT_DELAY   = 24 hours;
    uint256 public constant DEPOSIT_FEE_CAP_DELAY       = 24 hours;
    /// @notice Hard cap on a single `getVaults` page. Keeps RPC view
    ///         calls comfortably under HyperEVM's block gas limit
    ///         regardless of how large `_vaults` grows. Clients
    ///         needing the full list paginate.
    uint256 public constant MAX_PAGINATION_LIMIT      = 100;

    // ─── Username registry ─────────────────────────────────────────
    /// @notice Hashed-lowercase key for collision-free string-set membership.
    mapping(bytes32 => address) internal _usernameToVaultByHash;
    /// @notice Reserved-name set, populated once in constructor.
    mapping(bytes32 => bool) internal _isReservedByHash;
    /// @notice Original-casing display string keyed by vault address.
    mapping(address => string) public usernameDisplay;

    // ─── Vault registry ────────────────────────────────────────────
    /// @notice Append-only canonical vault list; index doubles as a
    ///         compact identifier surfaced in `VaultDeployed`.
    address[] internal _vaults;
    /// @notice "Was this address created by this factory?" — used by
    ///         indexer/UI for deduplication and trust signals.
    mapping(address => bool) public isCanonicalVault;
    /// @notice Singular: one vault per creator under decision 8.
    mapping(address => address) public creatorToVault;

    // ─── Float ─────────────────────────────────────────────────────
    /// @notice USDC balance the factory uses to absorb the 1 USDC
    ///         newCoreAccountFee per vault. Tracked explicitly so
    ///         stray transfers to the contract don't co-mingle with
    ///         the spendable float.
    uint256 public floatBalance;

    struct PendingFloatWithdrawal {
        address to;
        uint256 amount;
        uint64  executableAt;
    }
    /// @notice At most one pending withdrawal at a time. Mirrors
    ///         PR 4's propose/execute pattern.
    PendingFloatWithdrawal public pendingFloatWithdrawal;

    // ─── Protocol revenue routing (PR 6c) ──────────────────────────
    /// @notice Single destination for every protocol revenue stream:
    ///         deployment fees (this PR), deposit fees skimmed by vaults
    ///         (looked up via `ICreatorFactory.protocolTreasury`),
    ///         builder code fees (already configured separately).
    ///         Mutable via 7-day timelock — see `proposeTreasuryChange`.
    address public protocolTreasury;

    /// @notice Per-vault deployment fee, charged in `createVault`.
    ///         Default 20 USDC at construction; mutable via 24h timelock.
    uint256 public deploymentFeeUsdc;

    struct PendingTreasuryChange {
        address newTreasury;
        uint64  executableAt;
    }
    PendingTreasuryChange public pendingTreasuryChange;

    struct PendingDeploymentFee {
        uint256 newFeeUsdc;
        uint64  executableAt;
    }
    PendingDeploymentFee public pendingDeploymentFee;

    // ─── Vault deposit-fee defaults (PR 6b) ────────────────────────
    /// @notice Initial deposit-fee bps stamped onto every new vault at
    ///         createVault time. Vaults snapshot this value into their
    ///         own `depositFeeBps` at construction; subsequent factory
    ///         changes only affect FUTURE deploys (existing vaults
    ///         unaffected, since `depositFeeBps` is per-vault mutable
    ///         only by the creator via `setDepositFee`).
    uint16 public defaultDepositFeeBps = 25;

    /// @notice Cap on `depositFeeBps` at vault deployment, stamped into
    ///         the vault's immutable `MAX_DEPOSIT_FEE_BPS`. Existing
    ///         vaults' caps are frozen at their deploy-time value.
    uint16 public currentDepositFeeCapBps = 100;

    struct PendingDepositFeeDefault {
        uint16 newBps;
        uint64 executableAt;
    }
    PendingDepositFeeDefault public pendingDepositFeeDefault;

    struct PendingDepositFeeCap {
        uint16 newBps;
        uint64 executableAt;
    }
    PendingDepositFeeCap public pendingDepositFeeCap;

    // ─── Events ────────────────────────────────────────────────────
    event VaultDeployed(
        address indexed vault,
        address indexed creator,
        string username,
        uint256 initialStake,
        uint256 sharesMinted,
        uint256 vaultIndex,
        uint256 timestamp
    );
    event UsernameClaimed(string username, address vault);

    event FloatFunded(address indexed funder, uint256 amount, uint256 newBalance);
    event FloatWithdrawalProposed(address to, uint256 amount, uint64 executableAt);
    event FloatWithdrawalExecuted(address to, uint256 amount);
    event FloatWithdrawalCancelled(address to, uint256 amount);

    event TreasuryChangeProposed(address newTreasury, uint64 executableAt);
    event TreasuryChangeExecuted(address oldTreasury, address newTreasury);
    event TreasuryChangeCancelled(address newTreasury);

    event DeploymentFeeChangeProposed(uint256 newFeeUsdc, uint64 executableAt);
    event DeploymentFeeChangeExecuted(uint256 newFeeUsdc);
    event DeploymentFeeChangeCancelled(uint256 newFeeUsdc);

    /// @notice Emitted on every `createVault` when the configured
    ///         deployment fee was > 0 and transferred to the treasury.
    event DeploymentFeePaid(address indexed payer, uint256 amount, address indexed treasury);

    event DepositFeeDefaultProposed(uint16 newBps, uint64 executableAt);
    event DepositFeeDefaultExecuted(uint16 newBps);
    event DepositFeeDefaultCancelled(uint16 newBps);

    event DepositFeeCapProposed(uint16 newBps, uint64 executableAt);
    event DepositFeeCapExecuted(uint16 newBps);
    event DepositFeeCapCancelled(uint16 newBps);

    // ─── Errors ────────────────────────────────────────────────────
    error NotAdmin();
    error ZeroAddress();
    error ZeroAmount();
    /// @notice Stub-only; bodies wired in commits 2-5.
    error NotImplemented();

    error UsernameInvalidLength(uint256 length, uint256 min, uint256 max);
    error UsernameInvalidCharacter(uint256 position);
    error UsernameConsecutiveUnderscore(uint256 position);
    error UsernameLeadingOrTrailingUnderscore();
    error UsernameReserved();
    error UsernameTaken(address existingVault);
    error CreatorAlreadyHasVault(address existingVault);

    error InitialStakeBelowMinimum(uint256 stake, uint256 minimum);
    error FloatExhausted(uint256 have, uint256 need);
    /// @notice `proposeFloatWithdrawal` or `executeFloatWithdrawal`
    ///         rejects a withdrawal that exceeds the current
    ///         protocol `floatBalance`. Checked at both propose and
    ///         execute so admin can't queue a phantom withdrawal and
    ///         can't drain more than has been topped up.
    error WithdrawalExceedsFloat(uint256 requested, uint256 available);
    /// @notice `getVaults` called with `limit > MAX_PAGINATION_LIMIT`.
    ///         Offsets beyond `vaultCount` and `limit == 0` return an
    ///         empty array rather than reverting — simpler client UX.
    error PaginationLimitTooLarge(uint256 limit, uint256 max);
    /// @notice PR 6b: `proposeDepositFeeDefault` rejects a default
    ///         that exceeds the current cap; `proposeDepositFeeCap`
    ///         rejects a cap below the current default. Either path
    ///         keeps the invariant `default <= cap` enforced at the
    ///         factory level (vault constructor enforces it again
    ///         as defense-in-depth).
    error DepositFeeDefaultAboveCap(uint16 newDefault, uint16 cap);
    error DepositFeeCapBelowDefault(uint16 newCap, uint16 currentDefault);
    error DepositFeeCapZero();

    /// @notice Mirrors PR 4's timelock error surface. Float withdrawal
    ///         reuses the same propose/execute/cancel state machine.
    error TimelockNotElapsed(uint64 executableAt, uint64 currentTime);
    error NoPendingChange();
    error PendingChangeExists(uint64 executableAt);

    // ─── Modifiers ─────────────────────────────────────────────────
    modifier onlyAdmin() {
        if (msg.sender != PROTOCOL_ADMIN) revert NotAdmin();
        _;
    }

    // ─── Constructor ───────────────────────────────────────────────
    constructor(
        IERC20 usdc_,
        address coreDepositWallet_,
        address protocolAdmin_,
        address protocolTreasury_,
        uint256 initialDeploymentFeeUsdc_,
        bytes32[] memory reservedNameHashes_
    ) {
        if (address(usdc_) == address(0))    revert ZeroAddress();
        if (coreDepositWallet_ == address(0)) revert ZeroAddress();
        if (protocolAdmin_ == address(0))     revert ZeroAddress();
        if (protocolTreasury_ == address(0))  revert ZeroAddress();

        USDC = usdc_;
        CORE_DEPOSIT_WALLET = coreDepositWallet_;
        PROTOCOL_ADMIN = protocolAdmin_;
        protocolTreasury = protocolTreasury_;
        deploymentFeeUsdc = initialDeploymentFeeUsdc_;

        for (uint256 i = 0; i < reservedNameHashes_.length; i++) {
            _isReservedByHash[reservedNameHashes_[i]] = true;
        }
    }

    // ─── createVault (PR 5 commit 3b) ──────────────────────────────
    /// @notice Self-deploy a vault for `msg.sender` (the creator).
    ///         Permissionless per decision 8; spam-bounded by
    ///         MIN_INITIAL_STAKE_USDC. Atomic single-tx flow:
    ///
    ///         1. Validate username (length, charset, underscore
    ///            rules, not reserved, not taken).
    ///         2. Reject if `msg.sender` already owns a vault.
    ///         3. Reject if `initialStake < MIN_INITIAL_STAKE_USDC`.
    ///         4. Reject if factory float < `NEW_CORE_ACCOUNT_FEE_USDC`.
    ///         5. Pull `initialStake` from creator EVM-side.
    ///         6. Deploy vault via CREATE2 with salt =
    ///            keccak256(factory_addr, creator, nameHash).
    ///         7. Bridge `NEW_CORE_ACCOUNT_FEE_USDC + initialStake`
    ///            to the vault's Core address via CDW.depositFor in
    ///            a single call: CDW absorbs the 1 USDC fee, the
    ///            remaining `initialStake` credits to vault Core spot
    ///            (cross-block per INVESTIGATION sec 15.2).
    ///         8. Decrement `floatBalance` by the absorbed fee.
    ///         9. Call `vault.bootstrapDeposit(creator, initialStake)`
    ///            — mints shares to creator against pre-bootstrap NAV
    ///            (= 0 → virtual-shares offset), enqueues pending so
    ///            the tracker drains cleanly cross-block.
    ///         10. Write registries; emit `VaultDeployed` + `UsernameClaimed`.
    ///
    /// @param  username     Lowercase ASCII handle. Validated by
    ///                      `_validateUsernameOrRevert`.
    /// @param  initialStake Net stake (6-dec USDC), >= MIN_INITIAL_STAKE_USDC.
    /// @param  vaultName    ERC-20 token name (e.g. "Theorise alice BTC Long").
    /// @param  vaultSymbol  ERC-20 token symbol (e.g. "alice-BTC-L").
    /// @return vault        Deterministic CREATE2 address of the new vault.
    function createVault(
        string calldata username,
        uint256 initialStake,
        string calldata vaultName,
        string calldata vaultSymbol
    ) external nonReentrant returns (address vault) {
        bytes32 nameHash = _validateUsernameOrRevert(username);
        _checkCreatorAndStake(initialStake);

        // PR 6c: pull (deploymentFee + initialStake) atomically. The
        // deployment fee is forwarded to `protocolTreasury` before any
        // other state mutation; failure on the treasury transfer
        // unwinds the whole tx (atomic guarantee preserved).
        uint256 fee = deploymentFeeUsdc;
        USDC.safeTransferFrom(msg.sender, address(this), fee + initialStake);
        if (fee > 0) {
            address treasury = protocolTreasury;
            USDC.safeTransfer(treasury, fee);
            emit DeploymentFeePaid(msg.sender, fee, treasury);
        }

        vault = _deployVault(msg.sender, nameHash, vaultName, vaultSymbol);

        _bridgeActivationPlusStake(vault, initialStake);

        uint256 sharesMinted = CreatorVault(vault).bootstrapDeposit(msg.sender, initialStake);

        _registerVault(vault, msg.sender, username, nameHash);

        emit VaultDeployed(
            vault,
            msg.sender,
            username,
            initialStake,
            sharesMinted,
            _vaults.length - 1,
            block.timestamp
        );
        emit UsernameClaimed(username, vault);
    }

    function _checkCreatorAndStake(uint256 initialStake) internal view {
        address existing = creatorToVault[msg.sender];
        if (existing != address(0)) revert CreatorAlreadyHasVault(existing);
        if (initialStake < MIN_INITIAL_STAKE_USDC) {
            revert InitialStakeBelowMinimum(initialStake, MIN_INITIAL_STAKE_USDC);
        }
        if (floatBalance < NEW_CORE_ACCOUNT_FEE_USDC) {
            revert FloatExhausted(floatBalance, NEW_CORE_ACCOUNT_FEE_USDC);
        }
    }

    function _deployVault(
        address creator,
        bytes32 nameHash,
        string calldata vaultName,
        string calldata vaultSymbol
    ) internal returns (address vault) {
        // Salt includes the factory address so v1/v2 factory redeploys
        // can't collide on the same (creator, username) pair.
        bytes32 salt = keccak256(abi.encodePacked(address(this), creator, nameHash));
        // PR 6b: factory state drives both vault fee params. The vault
        // constructor checks `initial <= max` defensively; the factory's
        // propose-side checks (default <= cap on both paths) keep the
        // invariant. New vaults inherit current values; existing vaults
        // unaffected by subsequent factory changes.
        vault = address(new CreatorVault{salt: salt}(
            USDC,
            creator,
            PROTOCOL_ADMIN,
            CORE_DEPOSIT_WALLET,
            address(this),
            currentDepositFeeCapBps,
            defaultDepositFeeBps,
            vaultName,
            vaultSymbol
        ));
    }

    /// @dev Single combined bridge of (activation fee + stake) -> vault Core.
    ///      CDW absorbs the 1 USDC fee against the fresh account; the net
    ///      `initialStake` credits cross-block (INVESTIGATION sec 15.2).
    function _bridgeActivationPlusStake(address vault, uint256 initialStake) internal {
        uint256 bridgeAmount = NEW_CORE_ACCOUNT_FEE_USDC + initialStake;
        USDC.forceApprove(CORE_DEPOSIT_WALLET, bridgeAmount);
        ICoreDepositWallet(CORE_DEPOSIT_WALLET).depositFor(
            vault,
            bridgeAmount,
            HLConstants.CDW_DESTINATION_SPOT
        );
        floatBalance -= NEW_CORE_ACCOUNT_FEE_USDC;
    }

    function _registerVault(
        address vault,
        address creator,
        string calldata username,
        bytes32 nameHash
    ) internal {
        usernameDisplay[vault] = username;
        _usernameToVaultByHash[nameHash] = vault;
        creatorToVault[creator] = vault;
        isCanonicalVault[vault] = true;
        _vaults.push(vault);
    }

    /// @notice CREATE2 salt for a `(creator, username)` pair. Exposed
    ///         so off-chain clients (indexer, UI) can derive the
    ///         vault's deterministic address before deployment via
    ///         the standard CREATE2 formula:
    ///
    ///           address = last20(keccak256(0xff, factory, salt,
    ///                                      keccak256(initCode)))
    ///
    ///         The full address derivation needs the init-code hash,
    ///         which depends on the per-call `vaultName` / `vaultSymbol`
    ///         constructor args; clients compute that off-chain from
    ///         the CreatorVault artifact + canonical name/symbol
    ///         conventions. The salt is the protocol-specific piece
    ///         and lives here for unambiguity.
    function vaultSalt(address creator, string calldata username)
        external view returns (bytes32)
    {
        bytes32 nameHash = keccak256(bytes(username));
        return keccak256(abi.encodePacked(address(this), creator, nameHash));
    }

    // ─── Float management ──────────────────────────────────────────
    /// @notice Admin tops up the protocol float used to absorb the
    ///         1 USDC newCoreAccountFee per vault. Immediate (not
    ///         timelocked) — adding assets is never grief.
    /// @dev    Pulled forward into commit 3b because createVault needs
    ///         a non-empty float to function; the timelocked withdrawal
    ///         half stays stubbed until commit 5.
    function treasuryFundFloat(uint256 amount) external onlyAdmin nonReentrant {
        if (amount == 0) revert ZeroAmount();
        USDC.safeTransferFrom(msg.sender, address(this), amount);
        floatBalance += amount;
        emit FloatFunded(msg.sender, amount, floatBalance);
    }

    /// @notice Admin proposes withdrawing `amount` USDC from the
    ///         protocol float to `to` (EVM-side; USDC arrives at `to`'s
    ///         EVM address). 7-day timelock matches PR 4's stake-cap
    ///         delay -- both are protocol-asset operations with
    ///         depositor-visible blast radius.
    /// @dev    Amount validated against current `floatBalance` (the
    ///         state variable, not `IERC20.balanceOf(factory)`). Donor
    ///         transfers to the factory address don't count toward the
    ///         spendable float; if recovery of stray USDC is ever
    ///         needed, it's a separate (also timelocked) operation
    ///         outside PR 5 scope.
    function proposeFloatWithdrawal(address to, uint256 amount) external onlyAdmin {
        if (pendingFloatWithdrawal.executableAt != 0) {
            revert PendingChangeExists(pendingFloatWithdrawal.executableAt);
        }
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 available = floatBalance;
        if (amount > available) revert WithdrawalExceedsFloat(amount, available);

        uint64 executableAt = uint64(block.timestamp + FLOAT_WITHDRAWAL_DELAY);
        pendingFloatWithdrawal = PendingFloatWithdrawal({
            to: to,
            amount: amount,
            executableAt: executableAt
        });
        emit FloatWithdrawalProposed(to, amount, executableAt);
    }

    /// @notice Admin executes the pending withdrawal after the delay
    ///         elapses. Re-validates amount against current
    ///         `floatBalance` because intervening `createVault` calls
    ///         may have decremented it during the window.
    function executeFloatWithdrawal() external onlyAdmin nonReentrant {
        PendingFloatWithdrawal memory p = pendingFloatWithdrawal;
        if (p.executableAt == 0) revert NoPendingChange();
        if (block.timestamp < p.executableAt) {
            revert TimelockNotElapsed(p.executableAt, uint64(block.timestamp));
        }

        uint256 available = floatBalance;
        if (p.amount > available) revert WithdrawalExceedsFloat(p.amount, available);

        floatBalance = available - p.amount;
        delete pendingFloatWithdrawal;

        USDC.safeTransfer(p.to, p.amount);
        emit FloatWithdrawalExecuted(p.to, p.amount);
    }

    /// @notice Permissionless cancel of a pending withdrawal. Anyone
    ///         may cancel, intentionally: if an attacker compromises
    ///         the admin key and queues a hostile withdrawal during
    ///         the 7-day window, any monitoring observer can abort
    ///         it. Cost of griefing (legitimate admin proposes,
    ///         random user cancels) is bounded -- admin re-proposes
    ///         and waits another 7 days. Asymmetric vs PR 4's
    ///         admin-only cancels; see KNOWN_ISSUES.
    function cancelPendingFloatWithdrawal() external {
        PendingFloatWithdrawal memory p = pendingFloatWithdrawal;
        if (p.executableAt == 0) revert NoPendingChange();
        delete pendingFloatWithdrawal;
        emit FloatWithdrawalCancelled(p.to, p.amount);
    }

    // ─── Treasury change (PR 6c, 7-day timelock) ───────────────────
    /// @notice Admin proposes a new protocol treasury address.
    ///         Highest-blast-radius admin op on the factory — every
    ///         protocol revenue stream routes here, so 7-day delay
    ///         matches the stake-cap tier from PR 4.
    function proposeTreasuryChange(address newTreasury) external onlyAdmin {
        if (pendingTreasuryChange.executableAt != 0) {
            revert PendingChangeExists(pendingTreasuryChange.executableAt);
        }
        if (newTreasury == address(0)) revert ZeroAddress();
        uint64 executableAt = uint64(block.timestamp + TREASURY_CHANGE_DELAY);
        pendingTreasuryChange = PendingTreasuryChange({
            newTreasury: newTreasury,
            executableAt: executableAt
        });
        emit TreasuryChangeProposed(newTreasury, executableAt);
    }

    function executeTreasuryChange() external onlyAdmin {
        PendingTreasuryChange memory p = pendingTreasuryChange;
        if (p.executableAt == 0) revert NoPendingChange();
        if (block.timestamp < p.executableAt) {
            revert TimelockNotElapsed(p.executableAt, uint64(block.timestamp));
        }
        address old = protocolTreasury;
        protocolTreasury = p.newTreasury;
        delete pendingTreasuryChange;
        emit TreasuryChangeExecuted(old, p.newTreasury);
    }

    /// @notice Permissionless cancel of a pending treasury change.
    ///         Defense against admin-key compromise queuing a hostile
    ///         treasury swap during the 7-day window. Matches PR 5
    ///         float-withdrawal cancel semantics.
    function cancelPendingTreasuryChange() external {
        PendingTreasuryChange memory p = pendingTreasuryChange;
        if (p.executableAt == 0) revert NoPendingChange();
        delete pendingTreasuryChange;
        emit TreasuryChangeCancelled(p.newTreasury);
    }

    // ─── Deployment fee change (PR 6c, 24h timelock) ───────────────
    /// @notice Admin proposes a new per-vault deployment fee. 24h
    ///         delay matches PR 4's fee-tier cadence; lower stakes
    ///         than the treasury (no asset extraction, just pricing).
    function proposeDeploymentFee(uint256 newFeeUsdc) external onlyAdmin {
        if (pendingDeploymentFee.executableAt != 0) {
            revert PendingChangeExists(pendingDeploymentFee.executableAt);
        }
        uint64 executableAt = uint64(block.timestamp + DEPLOYMENT_FEE_CHANGE_DELAY);
        pendingDeploymentFee = PendingDeploymentFee({
            newFeeUsdc: newFeeUsdc,
            executableAt: executableAt
        });
        emit DeploymentFeeChangeProposed(newFeeUsdc, executableAt);
    }

    function executeDeploymentFee() external onlyAdmin {
        PendingDeploymentFee memory p = pendingDeploymentFee;
        if (p.executableAt == 0) revert NoPendingChange();
        if (block.timestamp < p.executableAt) {
            revert TimelockNotElapsed(p.executableAt, uint64(block.timestamp));
        }
        deploymentFeeUsdc = p.newFeeUsdc;
        delete pendingDeploymentFee;
        emit DeploymentFeeChangeExecuted(p.newFeeUsdc);
    }

    function cancelPendingDeploymentFee() external {
        PendingDeploymentFee memory p = pendingDeploymentFee;
        if (p.executableAt == 0) revert NoPendingChange();
        delete pendingDeploymentFee;
        emit DeploymentFeeChangeCancelled(p.newFeeUsdc);
    }

    // ─── Deposit fee default + cap (PR 6b, 24h timelock each) ─────
    /// @notice Admin proposes a new default deposit-fee bps that new
    ///         vaults will inherit. Invariant: `newBps <= currentDepositFeeCapBps`
    ///         keeps `default <= cap`. Existing vaults unaffected --
    ///         they snapshotted their default at deploy time.
    function proposeDepositFeeDefault(uint16 newBps) external onlyAdmin {
        if (pendingDepositFeeDefault.executableAt != 0) {
            revert PendingChangeExists(pendingDepositFeeDefault.executableAt);
        }
        if (newBps > currentDepositFeeCapBps) {
            revert DepositFeeDefaultAboveCap(newBps, currentDepositFeeCapBps);
        }
        uint64 executableAt = uint64(block.timestamp + DEPOSIT_FEE_DEFAULT_DELAY);
        pendingDepositFeeDefault = PendingDepositFeeDefault({
            newBps: newBps,
            executableAt: executableAt
        });
        emit DepositFeeDefaultProposed(newBps, executableAt);
    }

    function executeDepositFeeDefault() external {
        PendingDepositFeeDefault memory p = pendingDepositFeeDefault;
        if (p.executableAt == 0) revert NoPendingChange();
        if (block.timestamp < p.executableAt) {
            revert TimelockNotElapsed(p.executableAt, uint64(block.timestamp));
        }
        defaultDepositFeeBps = p.newBps;
        delete pendingDepositFeeDefault;
        emit DepositFeeDefaultExecuted(p.newBps);
    }

    function cancelPendingDepositFeeDefault() external {
        PendingDepositFeeDefault memory p = pendingDepositFeeDefault;
        if (p.executableAt == 0) revert NoPendingChange();
        delete pendingDepositFeeDefault;
        emit DepositFeeDefaultCancelled(p.newBps);
    }

    /// @notice Admin proposes a new deposit-fee cap. Invariants:
    ///         `newBps > 0` (cap == 0 would freeze every creator's
    ///         pricing at 0) and `newBps >= defaultDepositFeeBps`
    ///         (cap below default would create an inconsistent factory
    ///         state where new vaults deploy with bps > cap, which the
    ///         vault constructor would reject anyway).
    function proposeDepositFeeCap(uint16 newBps) external onlyAdmin {
        if (pendingDepositFeeCap.executableAt != 0) {
            revert PendingChangeExists(pendingDepositFeeCap.executableAt);
        }
        if (newBps == 0) revert DepositFeeCapZero();
        if (newBps < defaultDepositFeeBps) {
            revert DepositFeeCapBelowDefault(newBps, defaultDepositFeeBps);
        }
        uint64 executableAt = uint64(block.timestamp + DEPOSIT_FEE_CAP_DELAY);
        pendingDepositFeeCap = PendingDepositFeeCap({
            newBps: newBps,
            executableAt: executableAt
        });
        emit DepositFeeCapProposed(newBps, executableAt);
    }

    function executeDepositFeeCap() external {
        PendingDepositFeeCap memory p = pendingDepositFeeCap;
        if (p.executableAt == 0) revert NoPendingChange();
        if (block.timestamp < p.executableAt) {
            revert TimelockNotElapsed(p.executableAt, uint64(block.timestamp));
        }
        currentDepositFeeCapBps = p.newBps;
        delete pendingDepositFeeCap;
        emit DepositFeeCapExecuted(p.newBps);
    }

    function cancelPendingDepositFeeCap() external {
        PendingDepositFeeCap memory p = pendingDepositFeeCap;
        if (p.executableAt == 0) revert NoPendingChange();
        delete pendingDepositFeeCap;
        emit DepositFeeCapCancelled(p.newBps);
    }

    // ─── Username validation (PR 5 commit 2) ───────────────────────
    //
    // Cheap-revert-first ordering: length, leading/trailing underscore,
    // per-char + consecutive underscore walk, reserved, uniqueness.
    //
    // Case sensitivity: validator REJECTS uppercase rather than
    // normalising. The frontend is responsible for lowercasing before
    // submission; if it forgets, the user sees a clear revert. This
    // keeps the validator's job to "reject invalid input," not
    // "transform input," and avoids any indexer divergence between
    // "what the user typed" and "what's stored on-chain."

    /// @notice Pure structural check. Returns ok + hash + machine-readable
    ///         failure code (used by both the revert-flavored validator
    ///         and the bool-flavored `isUsernameAvailable`). Sharing one
    ///         walk eliminates drift risk between the two paths.
    /// @return ok True iff the username passes all structural rules.
    /// @return errorCode 0 ok, 1 length, 2 leading-underscore,
    ///         3 trailing-underscore, 4 invalid-char, 5 consec-underscore.
    /// @return errorPosition 0-based index of the offending byte (valid
    ///         for codes 4 and 5; 0 otherwise).
    /// @return nameHash keccak256 of the raw bytes; valid only when ok.
    function _checkUsernameStructure(string calldata username)
        internal pure
        returns (bool ok, uint8 errorCode, uint256 errorPosition, bytes32 nameHash)
    {
        bytes calldata raw = bytes(username);
        uint256 len = raw.length;

        if (len < MIN_USERNAME_LENGTH || len > MAX_USERNAME_LENGTH) {
            return (false, 1, 0, bytes32(0));
        }
        if (raw[0] == 0x5f) return (false, 2, 0, bytes32(0));
        if (raw[len - 1] == 0x5f) return (false, 3, len - 1, bytes32(0));

        bytes1 prev = 0x00;
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = raw[i];
            bool isLower = (c >= 0x61 && c <= 0x7a);
            bool isDigit = (c >= 0x30 && c <= 0x39);
            bool isUnder = (c == 0x5f);
            if (!(isLower || isDigit || isUnder)) {
                return (false, 4, i, bytes32(0));
            }
            if (isUnder && prev == 0x5f) {
                return (false, 5, i, bytes32(0));
            }
            prev = c;
        }

        return (true, 0, 0, keccak256(raw));
    }

    /// @notice Revert-flavored validator used by `createVault`. Combines
    ///         the pure structural check with reserved + uniqueness
    ///         lookups, reusing the single hash computation.
    function _validateUsernameOrRevert(string calldata username)
        internal view
        returns (bytes32 nameHash)
    {
        (bool ok, uint8 code, uint256 pos, bytes32 hash) = _checkUsernameStructure(username);
        if (!ok) {
            if (code == 1) {
                revert UsernameInvalidLength(
                    bytes(username).length, MIN_USERNAME_LENGTH, MAX_USERNAME_LENGTH
                );
            }
            if (code == 2 || code == 3) revert UsernameLeadingOrTrailingUnderscore();
            if (code == 4) revert UsernameInvalidCharacter(pos);
            if (code == 5) revert UsernameConsecutiveUnderscore(pos);
        }

        if (_isReservedByHash[hash]) revert UsernameReserved();
        address existing = _usernameToVaultByHash[hash];
        if (existing != address(0)) revert UsernameTaken(existing);

        return hash;
    }

    // ─── View functions (PR 5 commit 4 in part; canonical UI-side
    //     check `isUsernameAvailable` wired here in commit 2) ──────
    function usernameToVault(string calldata username) external view returns (address) {
        // Pure lookup: returns address(0) for unclaimed OR structurally
        // invalid names alike. Callers wanting a validity check should
        // use `isUsernameAvailable`.
        return _usernameToVaultByHash[keccak256(bytes(username))];
    }

    function isUsernameAvailable(string calldata username) external view returns (bool) {
        (bool ok, , , bytes32 hash) = _checkUsernameStructure(username);
        if (!ok) return false;
        if (_isReservedByHash[hash]) return false;
        return _usernameToVaultByHash[hash] == address(0);
    }

    /// @notice Paginated read of the canonical vault list. Returns an
    ///         empty array for `limit == 0` or `offset >= vaultCount`
    ///         (no revert — simpler for clients walking pages).
    ///         Reverts `PaginationLimitTooLarge` if `limit` exceeds
    ///         `MAX_PAGINATION_LIMIT`.
    function getVaults(uint256 offset, uint256 limit)
        external view returns (address[] memory page)
    {
        if (limit > MAX_PAGINATION_LIMIT) {
            revert PaginationLimitTooLarge(limit, MAX_PAGINATION_LIMIT);
        }
        uint256 total = _vaults.length;
        if (limit == 0 || offset >= total) return new address[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 size = end - offset;

        page = new address[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = _vaults[offset + i];
        }
    }

    function vaultCount() external view returns (uint256) {
        return _vaults.length;
    }
}
