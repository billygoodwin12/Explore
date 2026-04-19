// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {HLConstants} from "./HLConstants.sol";

interface ICoreWriter {
    function sendRawAction(bytes calldata data) external;
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/**
 * @title Vault (EIP-1167 clone target)
 * @notice Single-thesis Theorise vault. Creator declares an immutable
 *         position spec at deploy; depositors' USDC is auto-routed to those
 *         positions via CoreWriter. Creator capital is locked until settle.
 *
 * Lifecycle:
 *   OPEN   — deposits accepted, early exit allowed (depositors only).
 *   SETTLED — expiry passed and settle() called; only claim() allowed.
 *
 * Phase A (this commit): state machine + share math + access control.
 *   Actual CoreWriter routing + precompile NAV reads land in Phase B.
 *   _deployToCore() and _unwindFromCore() are overridable hooks that
 *   emit events in Phase A so tests can assert the accounting is right.
 */
contract Vault is ReentrancyGuard {
    struct Position {
        uint32 asset;     // HyperCore asset id
        bool isBuy;       // long=true, short=false
        uint16 allocBps;  // 0-10000, positions must sum to 10000
        uint8 lev;        // leverage multiplier
    }

    // ── Config (set once at init) ────────────────────────────────
    address public factory;
    address public creator;
    address public usdc;
    address public coreDepositWallet;
    address public protocolTreasury;
    uint64 public expiryTs;

    Position[] public positions;
    bytes32 public positionsHash;

    // ── State ────────────────────────────────────────────────────
    bool public initialized;
    bool public settled;
    uint256 public totalShares;
    mapping(address => uint256) public shares;

    /// Pessimistic NAV: running sum of deposited IM. Phase B swaps in
    /// `totalIM + unrealized PnL from accountMarginSummary precompile`.
    uint256 public totalIM;

    /// Creator's own deposit — locked until settle().
    uint256 public creatorLockedIM;

    uint16 public constant BPS_DENOM = 10_000;

    /// Early-exit penalty in bps. Disabled at 0 for v1 to not deter users.
    /// Split 50/50 protocol/remaining-LPs. Override in a subclass impl +
    /// redeploy the factory to flip it on.
    function earlyExitBps() public view virtual returns (uint16) { return 0; }

    // ── Events ───────────────────────────────────────────────────
    event Initialized(address indexed creator, uint64 expiryTs, uint256 creatorIM);
    event Deposited(address indexed user, uint256 amount, uint256 sharesMinted);
    event EarlyExited(
        address indexed user,
        uint256 sharesBurned,
        uint256 userGets,
        uint256 toTreasury,
        uint256 toLPs
    );
    event Settled(uint256 atTs, uint256 totalIM);
    event Claimed(address indexed user, uint256 sharesBurned, uint256 amount);
    event DeployRequested(uint256 amount);
    event UnwindRequested();

    // ── Errors ───────────────────────────────────────────────────
    error AlreadyInitialized();
    error NotFactory();
    error Closed();
    error NotExpired();
    error CreatorLocked();
    error InvalidAlloc();
    error NoShares();
    error NotSettled();
    error AlreadySettled();
    error ZeroAmount();

    // ── Init (clone pattern — no constructor logic) ──────────────
    /// @dev Factory clones this impl, transfers `_creatorIM` USDC to the
    ///      clone, then calls initialize in the same tx. The factory-passed
    ///      address is checked against msg.sender to prevent front-run init.
    function initialize(
        address _factory,
        address _creator,
        address _usdc,
        address _coreDepositWallet,
        address _protocolTreasury,
        uint64 _expiryTs,
        Position[] calldata _positions,
        uint256 _creatorIM
    ) external {
        if (initialized) revert AlreadyInitialized();
        if (msg.sender != _factory) revert NotFactory();
        if (_creatorIM == 0) revert ZeroAmount();
        initialized = true;

        factory = _factory;
        creator = _creator;
        usdc = _usdc;
        coreDepositWallet = _coreDepositWallet;
        protocolTreasury = _protocolTreasury;
        expiryTs = _expiryTs;

        uint256 allocSum;
        for (uint256 i = 0; i < _positions.length; i++) {
            positions.push(_positions[i]);
            allocSum += _positions[i].allocBps;
        }
        if (allocSum != BPS_DENOM) revert InvalidAlloc();
        positionsHash = keccak256(abi.encode(_positions));

        // Factory has already transferred _creatorIM USDC to this clone.
        totalShares = _creatorIM;
        shares[_creator] = _creatorIM;
        totalIM = _creatorIM;
        creatorLockedIM = _creatorIM;

        emit Initialized(_creator, _expiryTs, _creatorIM);
        _deployToCore(_creatorIM);
    }

    // ── Deposit ──────────────────────────────────────────────────
    function deposit(uint256 amount) external nonReentrant {
        if (settled || block.timestamp >= expiryTs) revert Closed();
        if (amount == 0) revert ZeroAmount();

        uint256 sharesOut = totalShares == 0 ? amount : (amount * totalShares) / totalIM;

        _safeTransferFrom(msg.sender, address(this), amount);

        totalShares += sharesOut;
        shares[msg.sender] += sharesOut;
        totalIM += amount;

        emit Deposited(msg.sender, amount, sharesOut);
        _deployToCore(amount);
    }

    // ── Early exit (mid-flight, penalty split 50/50) ─────────────
    function earlyWithdraw(uint256 shareAmount) external nonReentrant {
        if (settled) revert AlreadySettled();
        if (msg.sender == creator) revert CreatorLocked();
        if (shareAmount == 0 || shareAmount > shares[msg.sender]) revert NoShares();

        uint256 gross = (shareAmount * totalIM) / totalShares;
        uint256 fee = (gross * earlyExitBps()) / BPS_DENOM;
        uint256 toTreasury = fee / 2;
        uint256 toLPs = fee - toTreasury; // stays in vault, boosts NAV for remainers
        uint256 userGets = gross - fee;

        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
        // USDC that actually leaves the contract = userGets + toTreasury = gross - toLPs
        totalIM -= (gross - toLPs);

        if (toTreasury > 0) _safeTransfer(protocolTreasury, toTreasury);
        _safeTransfer(msg.sender, userGets);

        emit EarlyExited(msg.sender, shareAmount, userGets, toTreasury, toLPs);
    }

    // ── Settle (permissionless after expiry) ─────────────────────
    /// @notice Anyone can call after expiryTs. A keeper runs this at the
    ///         expiry block; if the keeper fails, a bounty-hunter picks it
    ///         up. Either way depositors aren't trapped.
    function settle() external nonReentrant {
        if (settled) revert AlreadySettled();
        if (block.timestamp < expiryTs) revert NotExpired();
        settled = true;
        _unwindFromCore();
        emit Settled(block.timestamp, totalIM);
    }

    // ── Post-settle claim (pro rata, no penalty, creator unlocked) ──
    function claim(uint256 shareAmount) external nonReentrant {
        if (!settled) revert NotSettled();
        if (shareAmount == 0 || shareAmount > shares[msg.sender]) revert NoShares();

        uint256 amount = (shareAmount * totalIM) / totalShares;
        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
        totalIM -= amount;

        _safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, shareAmount, amount);
    }

    // ── CoreWriter hooks (stubs for Phase A, real bytes in Phase B) ──
    function _deployToCore(uint256 amount) internal virtual {
        // Phase B:
        //   1. IERC20(usdc).transfer(coreDepositWallet, amount)
        //   2. action 7 (spot->perp): abi.encode(uint64(amount), true)
        //   3. per position: action 1 IOC with sz = amount * allocBps/10000 * lev / markPx
        //      All action bytes validated against positionsHash.
        emit DeployRequested(amount);
    }

    function _unwindFromCore() internal virtual {
        // Phase B:
        //   1. per position: action 1 reduceOnly=true IOC at wide slippage.
        //   2. action 7 (perp->spot).
        //   3. bridge spot USDC back to this contract.
        emit UnwindRequested();
    }

    // ── Minimal USDC helpers ─────────────────────────────────────
    function _safeTransfer(address to, uint256 amount) internal {
        require(IERC20(usdc).transfer(to, amount), "usdc transfer");
    }
    function _safeTransferFrom(address from, address to, uint256 amount) internal {
        require(IERC20(usdc).transferFrom(from, to, amount), "usdc transferFrom");
    }

    // ── Views ────────────────────────────────────────────────────
    function positionsCount() external view returns (uint256) { return positions.length; }
    function nav() external view returns (uint256) { return totalIM; }
}
