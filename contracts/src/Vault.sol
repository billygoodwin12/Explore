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
 *   OPEN    — deposits accepted, early exit allowed (depositors only).
 *   SETTLED — expiry passed and settle() called; only claim() allowed.
 *
 * Phase B gate: `coreRoutingEnabled` controls whether `_deployToCore` actually
 *   fires CoreWriter actions. When false (safe default for v1 mainnet), USDC
 *   stays idle in the vault and the vault behaves like Phase A. Flip to true
 *   only after the deposit + unbridge path has been validated end-to-end on
 *   mainnet (see README "Phase B open items").
 *
 * _unwindFromCore is intentionally still a stub in Phase B — unwind + Core->EVM
 *   bridge back is Phase C, after we've observed the real Core->EVM mechanism
 *   and CoreWriter delay timing on live mainnet.
 */
contract Vault is ReentrancyGuard {
    struct Position {
        uint32 asset;       // HyperCore asset id
        bool isBuy;         // long=true, short=false
        uint16 allocBps;    // 0-10000, positions must sum to 10000
        uint8 lev;          // leverage multiplier
        uint8 szDecimals;   // base-asset decimals (BTC=5, ETH=4, ...) for order sizing
    }

    // ── Config (set once at init) ────────────────────────────────
    address public factory;
    address public creator;
    address public usdc;
    address public coreDepositWallet;
    address public protocolTreasury;
    uint64 public expiryTs;
    bool public coreRoutingEnabled;
    /// Performance fee in bps charged on realized profit at settle.
    /// Wizard clamps to 0..3000 (0-30%). 0 = creator takes no perf fee.
    uint16 public perfFeeBps;

    Position[] public positions;
    bytes32 public positionsHash;

    // ── State ────────────────────────────────────────────────────
    bool public initialized;
    bool public settled;
    uint256 public totalShares;
    mapping(address => uint256) public shares;

    /// Pessimistic NAV: running sum of deposited IM. A later phase can swap in
    /// `totalIM + unrealized PnL from accountMarginSummary precompile` once
    /// that struct layout is pinned from a live mainnet call.
    uint256 public totalIM;

    /// Creator's own deposit — locked until settle().
    uint256 public creatorLockedIM;

    uint16 public constant BPS_DENOM = 10_000;

    /// Of the performance fee, this share goes to protocolTreasury. The rest
    /// goes to creator. 2000 = 20% protocol / 80% creator. Hardcoded so
    /// depositors can audit the split on-chain; redeploy impl to change.
    uint16 public constant PROTOCOL_PERF_SHARE_BPS = 2000;

    /// Hard cap on perfFeeBps accepted at init — matches the wizard's 30% slider.
    uint16 public constant MAX_PERF_FEE_BPS = 3000;

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
    event CoreBridged(uint256 amount);
    event CoreSpotToPerp(uint64 ntl);
    event CoreOrderPlaced(uint32 indexed asset, bool isBuy, uint64 limitPx, uint64 sz);

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
    error NoMarkPx();
    error SizeOutOfRange();
    error PriceOutOfRange();
    error InsufficientBalance();
    error PerfFeeTooHigh();

    // ── Init (clone pattern — no constructor logic) ──────────────
    function initialize(
        address _factory,
        address _creator,
        address _usdc,
        address _coreDepositWallet,
        address _protocolTreasury,
        uint64 _expiryTs,
        bool _coreRoutingEnabled,
        uint16 _perfFeeBps,
        Position[] calldata _positions,
        uint256 _creatorIM
    ) external {
        if (initialized) revert AlreadyInitialized();
        if (msg.sender != _factory) revert NotFactory();
        if (_creatorIM == 0) revert ZeroAmount();
        if (_perfFeeBps > MAX_PERF_FEE_BPS) revert PerfFeeTooHigh();
        initialized = true;

        factory = _factory;
        creator = _creator;
        usdc = _usdc;
        coreDepositWallet = _coreDepositWallet;
        protocolTreasury = _protocolTreasury;
        expiryTs = _expiryTs;
        coreRoutingEnabled = _coreRoutingEnabled;
        perfFeeBps = _perfFeeBps;

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
        uint256 toLPs = fee - toTreasury;
        uint256 userGets = gross - fee;

        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
        // USDC leaving the contract = userGets + toTreasury = gross - toLPs
        totalIM -= (gross - toLPs);

        // In Phase B with routing on, USDC is on HyperCore not in the vault.
        // The early-exit path is therefore disabled at the caller level in Phase B
        // via the `coreRoutingEnabled` flag — see guard below.
        if (coreRoutingEnabled) revert InsufficientBalance();

        if (toTreasury > 0) _safeTransfer(protocolTreasury, toTreasury);
        _safeTransfer(msg.sender, userGets);

        emit EarlyExited(msg.sender, shareAmount, userGets, toTreasury, toLPs);
    }

    // ── Settle (permissionless after expiry) ─────────────────────
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

        // Guard: in Phase B with routing on, USDC hasn't returned from HyperCore
        // until the Phase C unbridge completes. Claims will revert until then.
        if (IERC20(usdc).balanceOf(address(this)) < amount) revert InsufficientBalance();

        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
        totalIM -= amount;

        _safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, shareAmount, amount);
    }

    // ── CoreWriter deposit-path routing (Phase B) ────────────────
    function _deployToCore(uint256 amount) internal virtual {
        emit DeployRequested(amount);
        if (!coreRoutingEnabled || amount == 0) return;

        // 1. Bridge ERC20 USDC EVM -> HyperCore spot.
        //    Sender's (this contract's) HyperCore spot account gets credited.
        require(IERC20(usdc).transfer(coreDepositWallet, amount), "bridge usdc");
        emit CoreBridged(amount);

        // 2. Move spot -> perp margin (action 7).
        //    `ntl` is in HyperCore USD units (6dp) — amount fits directly.
        if (amount > type(uint64).max) revert SizeOutOfRange();
        _sendAction(
            HLConstants.ACTION_USD_CLASS_TRANSFER,
            abi.encode(uint64(amount), true)
        );
        emit CoreSpotToPerp(uint64(amount));

        // 3. Fire one IOC limit order per position, sized proportionally.
        uint256 n = positions.length;
        for (uint256 i = 0; i < n; i++) {
            Position memory p = positions[i];
            uint256 posIM = (amount * p.allocBps) / BPS_DENOM;
            if (posIM == 0) continue;
            _placeIocOrder(p, posIM * uint256(p.lev), false);
        }
    }

    // ── CoreWriter unwind-path (Phase B stub) ────────────────────
    /// @dev Phase C will fill this with: reduceOnly IOC close per position,
    ///      perp->spot transfer, and Core->EVM bridge-back. We need live
    ///      mainnet evidence of the Core->EVM mechanism before committing.
    function _unwindFromCore() internal virtual {
        emit UnwindRequested();
    }

    // ── Order placement helper ───────────────────────────────────
    /// @param notional Target notional in USDC 6dp units.
    /// @param reduceOnly true for unwinds (Phase C).
    function _placeIocOrder(Position memory p, uint256 notional, bool reduceOnly) internal {
        uint64 mark = _markPx(p.asset);
        if (mark == 0) revert NoMarkPx();

        // ── Scaling (see "hyper-evm-lib" convention; validate on mainnet) ──
        // markPx is scaled by 10^(6 - szDecimals).
        // Orders take limitPx + sz scaled by 10^8.
        //   px_1e8 = markPx * 10^(szDecimals + 2)
        //   sz_1e8 = notional_6dp * 10^8 / (markPx * 10^szDecimals)
        uint256 tenSz = 10 ** uint256(p.szDecimals);
        uint256 pxMark_1e8 = uint256(mark) * tenSz * 100; // mark * 10^(szDec+2)
        uint256 pxLimit_1e8 = p.isBuy
            ? (pxMark_1e8 * 105) / 100   // pay up to 5% above mark
            : (pxMark_1e8 * 95) / 100;   // sell down to 5% below mark
        if (pxLimit_1e8 == 0 || pxLimit_1e8 > type(uint64).max) revert PriceOutOfRange();

        uint256 sz_1e8 = (notional * 1e8) / (uint256(mark) * tenSz);
        if (sz_1e8 == 0 || sz_1e8 > type(uint64).max) revert SizeOutOfRange();

        // Unwinds fire the opposite side.
        bool side = reduceOnly ? !p.isBuy : p.isBuy;

        _sendAction(
            HLConstants.ACTION_LIMIT_ORDER,
            abi.encode(
                p.asset,
                side,
                uint64(pxLimit_1e8),
                uint64(sz_1e8),
                reduceOnly,
                HLConstants.TIF_IOC,
                uint128(0)
            )
        );
        emit CoreOrderPlaced(p.asset, side, uint64(pxLimit_1e8), uint64(sz_1e8));
    }

    // ── CoreWriter send helper ───────────────────────────────────
    function _sendAction(uint24 actionId, bytes memory payload) internal {
        // Layout: 0x01 (version) || actionId (3B big-endian) || abi.encode(...)
        bytes memory data = bytes.concat(bytes1(0x01), bytes3(actionId), payload);
        ICoreWriter(HLConstants.CORE_WRITER).sendRawAction(data);
    }

    // ── Precompile read helpers ──────────────────────────────────
    function _markPx(uint32 asset) internal view returns (uint64) {
        (bool ok, bytes memory ret) = HLConstants.MARK_PX_PRECOMPILE.staticcall(
            abi.encode(asset)
        );
        if (!ok || ret.length != 32) return 0;
        return abi.decode(ret, (uint64));
    }

    /// @notice Raw margin summary for this vault on perp dex `perpDexIndex`
    ///         (0 = default dex). Decode off-chain until the struct layout is
    ///         pinned from a live mainnet call.
    function accountMarginSummaryRaw(uint32 perpDexIndex) external view returns (bytes memory) {
        (bool ok, bytes memory ret) = HLConstants.ACCOUNT_MARGIN_SUMMARY_PRECOMPILE.staticcall(
            abi.encode(perpDexIndex, address(this))
        );
        require(ok, "marginSummary");
        return ret;
    }

    /// @notice Current mark price for a perp asset (raw precompile value).
    function markPx(uint32 asset) external view returns (uint64) { return _markPx(asset); }

    // ── USDC helpers ─────────────────────────────────────────────
    function _safeTransfer(address to, uint256 amount) internal {
        require(IERC20(usdc).transfer(to, amount), "usdc transfer");
    }
    function _safeTransferFrom(address from, address to, uint256 amount) internal {
        require(IERC20(usdc).transferFrom(from, to, amount), "usdc transferFrom");
    }

    // ── Views ────────────────────────────────────────────────────
    function positionsCount() external view returns (uint256) { return positions.length; }
    function nav() external view returns (uint256) { return totalIM; }

    /// @return protocolBps share of the perf fee routed to protocolTreasury
    /// @return creatorBps  share of the perf fee routed to creator
    function perfFeeSplit() external pure returns (uint16 protocolBps, uint16 creatorBps) {
        return (PROTOCOL_PERF_SHARE_BPS, BPS_DENOM - PROTOCOL_PERF_SHARE_BPS);
    }
}
