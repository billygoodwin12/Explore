// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {HLConstants, ICoreWriter, ICoreDepositWallet} from "../src/HLConstants.sol";

/// @notice Same-transaction Core-credit-visibility probe. Gates the
///         factory's atomic createVault flow (PR 5 commit 3).
///
/// Question this answers:
///   Within a single EVM transaction on HyperEVM mainnet, after
///   `CoreDepositWallet.depositFor(self, amount, SPOT)` completes,
///   does an immediate precompile read of `_coreSpotUSDC(self)`
///   reflect the credit?
///
///   - If YES (`lastIntraReadValue > 0`): atomic factory flow works
///     as designed. Vault's `VaultNotActivated` guard sees a
///     non-zero balance during the same tx as factory's bridge.
///   - If NO (`lastIntraReadValue == 0` while
///     `readCoreSpotNow() > 0` in a later eth_call): cross-block-only
///     visibility. Factory needs a `bootstrapDeposit` entry point on
///     the vault that skips `VaultNotActivated` for the factory caller.
///
/// Send 2 USDC, not 1: the probe contract's Core account is fresh,
/// so the first bridge consumes 1 USDC `newCoreAccountFee`. With
/// 2 USDC sent, net credit is 1 USDC; `lastIntraReadValue` will be
/// `1e6` (== 1 USDC, 6-dec) on success or `0` on cross-block-only.
contract MainnetAtomicProbe {
    using SafeERC20 for IERC20;

    address public immutable USDC;
    address public immutable CORE_DEPOSIT_WALLET;
    address public immutable owner;

    /// @notice Storage slot the test transaction writes to. Read it
    ///         via `eth_call` after the tx confirms to learn the
    ///         intra-tx visibility outcome.
    uint256 public lastIntraReadValue;
    bool    public probeRan;

    error NotOwner();
    error PrecompileFailed();

    constructor(address usdc, address coreDepositWallet) {
        USDC = usdc;
        CORE_DEPOSIT_WALLET = coreDepositWallet;
        owner = msg.sender;
    }

    /// @notice Single-tx probe: bridge, then immediately read.
    ///         The read result is stored to `lastIntraReadValue`
    ///         for off-chain inspection.
    function probe(uint256 amount) external {
        IERC20(USDC).forceApprove(CORE_DEPOSIT_WALLET, amount);
        ICoreDepositWallet(CORE_DEPOSIT_WALLET).depositFor(
            address(this),
            amount,
            HLConstants.CDW_DESTINATION_SPOT
        );
        // Immediate read — same tx, same call frame after the bridge returns.
        lastIntraReadValue = _readCoreSpot();
        probeRan = true;
    }

    /// @notice Cross-block sanity check. Caller reads this via
    ///         eth_call after the probe tx confirms; compare to
    ///         `lastIntraReadValue`.
    function readCoreSpotNow() external view returns (uint256) {
        return _readCoreSpot();
    }

    function _readCoreSpot() internal view returns (uint256) {
        (bool ok, bytes memory data) = HLConstants.SPOT_BALANCE_PRECOMPILE.staticcall(
            abi.encode(address(this), HLConstants.USDC_SPOT_INDEX)
        );
        if (!ok) revert PrecompileFailed();
        (uint64 total,,) = abi.decode(data, (uint64, uint64, uint64));
        return uint256(total) / 100; // 8-dec native -> 6-dec EVM units
    }

    // ─── Recovery ──────────────────────────────────────────────────

    function recoverEvm() external {
        if (msg.sender != owner) revert NotOwner();
        IERC20 t = IERC20(USDC);
        t.safeTransfer(owner, t.balanceOf(address(this)));
    }

    function recoverCore(uint256 amount6) external {
        if (msg.sender != owner) revert NotOwner();
        uint64 amount8 = uint64(amount6 * 100);
        bytes memory payload = abi.encode(owner, HLConstants.USDC_SPOT_INDEX, amount8);
        bytes memory data = bytes.concat(
            bytes1(0x01),
            bytes3(HLConstants.ACTION_SPOT_SEND),
            payload
        );
        ICoreWriter(HLConstants.CORE_WRITER).sendRawAction(data);
    }
}

/// @title  RunMainnetAtomicProbe — gate for PR 5 commit 3 atomic flow
/// @notice Deploys MainnetAtomicProbe, funds it with 2 USDC EVM-side,
///         fires the single-tx bridge+read, prints the cast commands
///         to read the intra-tx storage slot.
///
/// Setup (DO NOT use a wallet you care about):
///   cast wallet new                       # generate fresh deployer
///   # fund the new EOA with ~$5 HYPE (gas) + 2 USDC mainnet
///   export PROBE_PRIVATE_KEY=0x...
///
/// Run:
///   forge script script/MainnetAtomicProbe.s.sol:RunMainnetAtomicProbe \
///     --rpc-url https://rpc.hyperliquid.xyz/evm \
///     --broadcast --slow -vvv
///
/// Then:
///   cast call $PROBE "lastIntraReadValue()(uint256)" \
///     --rpc-url https://rpc.hyperliquid.xyz/evm
///   cast call $PROBE "readCoreSpotNow()(uint256)" \
///     --rpc-url https://rpc.hyperliquid.xyz/evm
///
/// Interpretation:
///   lastIntraReadValue=1e6, readCoreSpotNow=1e6 -> case (a), intra-tx visible.
///   lastIntraReadValue=0,   readCoreSpotNow=1e6 -> case (b), cross-block only.
///   both 0 -> bridge failed entirely; investigate.
///
/// Recovery (after probe completes):
///   cast send $PROBE "recoverCore(uint256)" 1000000 \
///     --private-key $PROBE_PRIVATE_KEY \
///     --rpc-url https://rpc.hyperliquid.xyz/evm
///   # wait 30s for spotSend to settle, then drain EOA HYPE
///   # `recoverEvm` is a no-op here since EVM USDC was fully bridged.
contract RunMainnetAtomicProbe is Script {
    address constant MAINNET_USDC = 0xb88339CB7199b77E23DB6E890353E22632Ba630f;
    address constant MAINNET_CDW  = 0x6B9E773128f453f5c2C60935Ee2DE2CBc5390A24;
    uint256 constant PROBE_AMOUNT = 2e6; // 2 USDC: 1 absorbed as newCoreAccountFee, 1 nets to Core

    function run() external {
        uint256 deployerKey = vm.envUint("PROBE_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=== Mainnet atomic-flow probe (same-tx visibility) ===");
        console.log("Deployer:", deployer);
        console.log("USDC:", MAINNET_USDC);
        console.log("CoreDepositWallet:", MAINNET_CDW);
        console.log("Probe amount (6-dec USDC):", PROBE_AMOUNT);

        uint256 evmBefore = IERC20(MAINNET_USDC).balanceOf(deployer);
        require(evmBefore >= PROBE_AMOUNT, "deployer USDC balance insufficient");

        vm.startBroadcast(deployerKey);

        MainnetAtomicProbe probe = new MainnetAtomicProbe(MAINNET_USDC, MAINNET_CDW);
        console.log("Probe deployed at:", address(probe));

        IERC20(MAINNET_USDC).transfer(address(probe), PROBE_AMOUNT);

        probe.probe(PROBE_AMOUNT);
        console.log("probe.probe() submitted at block:", block.number);

        vm.stopBroadcast();

        console.log("");
        console.log("=== NEXT STEPS ===");
        console.log(string.concat("  export PROBE=", vm.toString(address(probe))));
        console.log("");
        console.log("  cast call $PROBE \"lastIntraReadValue()(uint256)\" \\");
        console.log("    --rpc-url https://rpc.hyperliquid.xyz/evm");
        console.log("");
        console.log("  cast call $PROBE \"readCoreSpotNow()(uint256)\" \\");
        console.log("    --rpc-url https://rpc.hyperliquid.xyz/evm");
        console.log("");
        console.log("Expected outcomes:");
        console.log("  intra=1000000, now=1000000 -> case (a): atomic flow works");
        console.log("  intra=0,       now=1000000 -> case (b): need bootstrapDeposit");
        console.log("  intra=0,       now=0       -> bridge failed; investigate");
        console.log("");
        console.log("Recovery:");
        console.log("  cast send $PROBE \"recoverCore(uint256)\" 1000000 \\");
        console.log("    --private-key $PROBE_PRIVATE_KEY \\");
        console.log("    --rpc-url https://rpc.hyperliquid.xyz/evm");
        console.log("  # wait 30s for spotSend, then sweep deployer EOA HYPE");
    }
}
