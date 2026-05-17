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

    function getVaults(uint256 /*offset*/, uint256 /*limit*/)
        external view returns (address[] memory)
    {
        revert NotImplemented();
    }

    function vaultCount() external view returns (uint256) {
        return _vaults.length;
    }
}
