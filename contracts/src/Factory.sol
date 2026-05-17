// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Factory for deploying CreatorVault instances. Enforces
///         username uniqueness (case-insensitive, locked at deploy),
///         performs atomic creator-stake deposit at deploy time,
///         and absorbs the 1 USDC newCoreAccountFee per vault from
///         a protocol-funded float. See FACTORY_DESIGN_NOTES.md for
///         the design rationale and PR 5 commit map.
contract Factory is ReentrancyGuard {
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

    // ─── Errors ────────────────────────────────────────────────────
    error NotAdmin();
    error ZeroAddress();
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
    error PaginationOutOfRange(uint256 offset, uint256 length);
    error PaginationLimitTooLarge(uint256 limit, uint256 max);

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
        bytes32[] memory reservedNameHashes_
    ) {
        if (address(usdc_) == address(0))    revert ZeroAddress();
        if (coreDepositWallet_ == address(0)) revert ZeroAddress();
        if (protocolAdmin_ == address(0))     revert ZeroAddress();

        USDC = usdc_;
        CORE_DEPOSIT_WALLET = coreDepositWallet_;
        PROTOCOL_ADMIN = protocolAdmin_;

        for (uint256 i = 0; i < reservedNameHashes_.length; i++) {
            _isReservedByHash[reservedNameHashes_[i]] = true;
        }
    }

    // ─── createVault (PR 5 commit 3) ───────────────────────────────
    function createVault(
        string calldata /*username*/,
        uint256 /*initialStake*/,
        string calldata /*vaultName*/,
        string calldata /*vaultSymbol*/
    ) external nonReentrant returns (address /*vault*/) {
        revert NotImplemented();
    }

    // ─── Float management (PR 5 commit 5) ──────────────────────────
    function treasuryFundFloat(uint256 /*amount*/) external onlyAdmin nonReentrant {
        revert NotImplemented();
    }

    function proposeFloatWithdrawal(address /*to*/, uint256 /*amount*/) external onlyAdmin {
        revert NotImplemented();
    }

    function executeFloatWithdrawal() external onlyAdmin nonReentrant {
        revert NotImplemented();
    }

    function cancelPendingFloatWithdrawal() external onlyAdmin {
        revert NotImplemented();
    }

    // ─── View functions (PR 5 commit 4) ────────────────────────────
    function usernameToVault(string calldata /*username*/) external view returns (address) {
        revert NotImplemented();
    }

    function isUsernameAvailable(string calldata /*username*/) external view returns (bool) {
        revert NotImplemented();
    }

    function getVaults(uint256 /*offset*/, uint256 /*limit*/)
        external view returns (address[] memory)
    {
        revert NotImplemented();
    }

    function vaultCount() external view returns (uint256) {
        return _vaults.length;
    }
}
