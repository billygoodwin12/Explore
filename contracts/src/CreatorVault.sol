// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {HLConstants, ICoreWriter, ICoreDepositWallet} from "./HLConstants.sol";

contract CreatorVault is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    address public immutable CREATOR;

    /// @notice Circle's CoreDepositWallet — the canonical USDC bridge.
    ///         Direct ERC-20 transfers to the per-token system address are
    ///         blocked by Circle's Blacklistable list, so USDC must go
    ///         through this proxy. Per-network address (mainnet/testnet
    ///         differ) baked in at construction.
    ICoreDepositWallet public immutable BRIDGE;

    uint16 public constant MIN_CREATOR_BPS = 2000;
    uint256 public constant CREATOR_STAKE_CAP_USDC = 100e6;

    uint16 public depositFeeBps;
    address public feeRecipient;
    uint16 public constant MAX_DEPOSIT_FEE_BPS = 1000;

    event DepositFeeUpdated(uint16 bps, address recipient);
    event BridgedToCore(uint256 amount);
    event MovedOnCore(uint256 amount, bool toPerp);
    event BridgedToEvm(uint64 amount);
    event OrderPlaced(uint32 asset, bool isBuy, uint64 limitPx, uint64 sz, uint8 tif);
    event BuilderApproved(address indexed builder, uint64 maxFeeRate);

    error CreatorStakeTooLow(uint256 currentAssets, uint256 required);
    error DepositFeeTooHigh(uint16 bps, uint16 cap);
    error NotCreator();
    error ZeroAmount();

    modifier onlyCreator() {
        if (msg.sender != CREATOR) revert NotCreator();
        _;
    }

    constructor(
        IERC20 usdc,
        ICoreDepositWallet bridge_,
        address creator_,
        address admin_,
        string memory name_,
        string memory symbol_
    )
        ERC4626(usdc) ERC20(name_, symbol_) Ownable(admin_)
    {
        CREATOR = creator_;
        BRIDGE = bridge_;
    }

    function setDepositFee(uint16 bps, address recipient) external onlyOwner {
        if (bps > MAX_DEPOSIT_FEE_BPS) revert DepositFeeTooHigh(bps, MAX_DEPOSIT_FEE_BPS);
        depositFeeBps = bps; feeRecipient = recipient;
        emit DepositFeeUpdated(bps, recipient);
    }

    function previewDeposit(uint256 assets) public view override returns (uint256) {
        return super.previewDeposit(_netOfFee(assets));
    }
    function previewMint(uint256 shares) public view override returns (uint256) {
        return _grossOfFee(super.previewMint(shares));
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        super._deposit(caller, receiver, assets, shares);
        uint256 fee = assets - _netOfFee(assets);
        if (fee > 0 && feeRecipient != address(0)) IERC20(asset()).safeTransfer(feeRecipient, fee);
        _enforceCreatorStake();
    }
    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares) internal override {
        super._withdraw(caller, receiver, owner_, assets, shares);
        if (owner_ == CREATOR) _enforceCreatorStake();
    }

    function _netOfFee(uint256 a) internal view returns (uint256) {
        uint16 bps = depositFeeBps;
        if (bps == 0 || feeRecipient == address(0)) return a;
        return a - Math.mulDiv(a, bps, 10_000);
    }
    function _grossOfFee(uint256 net) internal view returns (uint256) {
        uint16 bps = depositFeeBps;
        if (bps == 0 || feeRecipient == address(0)) return net;
        return Math.mulDiv(net, 10_000, 10_000 - bps, Math.Rounding.Ceil);
    }
    function _enforceCreatorStake() internal view {
        if (totalSupply() == 0) return;
        uint256 ca = convertToAssets(balanceOf(CREATOR));
        uint256 bf = Math.mulDiv(totalAssets(), MIN_CREATOR_BPS, 10_000);
        uint256 mr = bf < CREATOR_STAKE_CAP_USDC ? bf : CREATOR_STAKE_CAP_USDC;
        if (ca < mr) revert CreatorStakeTooLow(ca, mr);
    }

    /// @notice Move `amount` of vault USDC from EVM to the vault's own
    ///         Core spot account via Circle's CoreDepositWallet. From there
    ///         use `moveOnCore` to flip into the perp account before trading.
    /// @dev    Lands in spot (DEX_SPOT) so withdrawals via `bridgeToEvm`
    ///         (which only sources from spot) stay one-hop.
    function bridgeToCore(uint256 amount) external onlyCreator {
        if (amount == 0) revert ZeroAmount();
        IERC20(asset()).forceApprove(address(BRIDGE), amount);
        BRIDGE.depositFor(address(this), amount, HLConstants.DEX_SPOT);
        emit BridgedToCore(amount);
    }

    function moveOnCore(uint256 amount, bool toPerp) external onlyCreator {
        if (amount == 0) revert ZeroAmount();
        bytes memory payload = abi.encode(uint64(amount), toPerp);
        _sendAction(HLConstants.ACTION_USD_CLASS_TRANSFER, payload);
        emit MovedOnCore(amount, toPerp);
    }

    function bridgeToEvm(uint256 amount) external onlyCreator {
        if (amount == 0) revert ZeroAmount();
        uint64 coreAmount = uint64(amount * 100);
        bytes memory payload = abi.encode(HLConstants.USDC_SYSTEM_ADDRESS, HLConstants.USDC_SPOT_INDEX, coreAmount);
        _sendAction(HLConstants.ACTION_SPOT_SEND, payload);
        emit BridgedToEvm(uint64(amount));
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

    function _sendAction(uint24 actionId, bytes memory payload) internal {
        bytes memory data = bytes.concat(bytes1(0x01), bytes3(actionId), payload);
        ICoreWriter(HLConstants.CORE_WRITER).sendRawAction(data);
    }
}
