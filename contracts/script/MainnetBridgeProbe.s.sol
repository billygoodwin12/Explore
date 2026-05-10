// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {HLConstants, ICoreWriter} from "../src/HLConstants.sol";

/// @notice One-shot probe contract. Holds USDC, bridges via system-address
///         transfer, exposes a precompile reader so the runner script can
///         confirm Core-side credit, and provides recovery hatches.
contract MainnetBridgeProbe {
    using SafeERC20 for IERC20;

    address public immutable USDC;
    address public immutable owner;

    error NotOwner();

    constructor(address usdc) {
        USDC = usdc;
        owner = msg.sender;
    }

    /// @notice Permissionless bridge — just the EVM-side transfer.
    function bridge(uint256 amount) external {
        IERC20(USDC).safeTransfer(HLConstants.USDC_SYSTEM_ADDRESS, amount);
    }

    /// @notice Read this contract's Core spot USDC balance via precompile.
    ///         Returns 6-dec EVM units (8-dec native / 100).
    function readCoreSpot() external view returns (uint256) {
        (bool ok, bytes memory data) = HLConstants.SPOT_BALANCE_PRECOMPILE.staticcall(
            abi.encode(address(this), HLConstants.USDC_SPOT_INDEX)
        );
        require(ok, "spot precompile failed");
        (uint64 total,,) = abi.decode(data, (uint64, uint64, uint64));
        return uint256(total) / 100;
    }

    /// @notice Owner: drain remaining EVM USDC back.
    function recoverEvm() external {
        if (msg.sender != owner) revert NotOwner();
        IERC20 t = IERC20(USDC);
        t.safeTransfer(owner, t.balanceOf(address(this)));
    }

    /// @notice Owner: spotSend Core USDC back to owner via CoreWriter
    ///         action 6. `amount6` is 6-dec USDC; converts to 8-dec native.
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

/// @title  RunMainnetBridgeProbe — Phase 2 of the bridge-verification protocol.
/// @notice Deploys a one-shot `MainnetBridgeProbe`, funds it from the deployer
///         EOA, fires the bridge, and prints the cast commands needed to
///         observe Core-side settlement.
///
///         Confirms or refutes the silent-fail mode the prior investigation
///         hit: EVM tx succeeds but Core spot balance never increases.
///
/// Setup (DO NOT use a wallet you care about):
///   cast wallet new                        # generate fresh deployer
///   # fund the new EOA with ~$15 HYPE (gas) + 5 USDC mainnet
///   export PROBE_PRIVATE_KEY=0x...
///
/// Run:
///   forge script script/MainnetBridgeProbe.s.sol:RunMainnetBridgeProbe \
///     --rpc-url https://rpc.hyperliquid.xyz/evm \
///     --broadcast --slow -vvv
///
/// Then:
///   - Wait 30s
///   - Poll `readCoreSpot()` via the cast commands the script prints
///   - Update INVESTIGATION_EVM_DEPOSIT.md sec 6 with the result
///   - Recover funds via `recoverCore` + `recoverEvm`, then drain HYPE
contract RunMainnetBridgeProbe is Script {
    address constant MAINNET_USDC = 0xb88339CB7199b77E23DB6E890353E22632Ba630f;
    uint256 constant PROBE_AMOUNT = 5e6;

    function run() external {
        uint256 deployerKey = vm.envUint("PROBE_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=== Mainnet bridge probe ===");
        console.log("Deployer:", deployer);
        console.log("Probe amount (6-dec USDC):", PROBE_AMOUNT);

        uint256 evmBefore = IERC20(MAINNET_USDC).balanceOf(deployer);
        require(evmBefore >= PROBE_AMOUNT, "deployer USDC balance insufficient");

        vm.startBroadcast(deployerKey);

        MainnetBridgeProbe probe = new MainnetBridgeProbe(MAINNET_USDC);
        console.log("Probe deployed at:", address(probe));

        IERC20(MAINNET_USDC).transfer(address(probe), PROBE_AMOUNT);
        uint256 probeEvm = IERC20(MAINNET_USDC).balanceOf(address(probe));
        console.log("Probe EVM USDC balance:", probeEvm);

        uint256 coreBefore = probe.readCoreSpot();
        console.log("Probe Core spot before bridge:", coreBefore);

        probe.bridge(PROBE_AMOUNT);
        console.log("Bridge tx submitted at block:", block.number);

        vm.stopBroadcast();

        console.log("Probe EVM USDC balance after bridge:",
            IERC20(MAINNET_USDC).balanceOf(address(probe)));

        console.log("");
        console.log("=== NEXT STEPS ===");
        console.log("Wait 30 seconds, then run:");
        console.log("");
        console.log(string.concat("  export PROBE=", vm.toString(address(probe))));
        console.log("");
        console.log("  cast call $PROBE \"readCoreSpot()(uint256)\" \\");
        console.log("    --rpc-url https://rpc.hyperliquid.xyz/evm");
        console.log("");
        console.log("Expected on success: 5000000  (5 USDC, 6-dec)");
        console.log("If 0: bridge silently failed -- Phase 2 FAIL.");
        console.log("");
        console.log("Latency measurement (poll every 1s):");
        console.log("  for i in $(seq 1 60); do");
        console.log("    BLOCK=$(cast block-number --rpc-url https://rpc.hyperliquid.xyz/evm)");
        console.log("    CORE=$(cast call $PROBE \"readCoreSpot()(uint256)\" \\");
        console.log("      --rpc-url https://rpc.hyperliquid.xyz/evm)");
        console.log("    echo \"[$(date +%T)] block=$BLOCK core=$CORE\"");
        console.log("    [ \"$CORE\" != \"0\" ] && break");
        console.log("    sleep 1");
        console.log("  done");
        console.log("");
        console.log("Recovery (after probe completes):");
        console.log("  cast send $PROBE \"recoverCore(uint256)\" 5000000 \\");
        console.log("    --private-key $PROBE_PRIVATE_KEY \\");
        console.log("    --rpc-url https://rpc.hyperliquid.xyz/evm");
        console.log("  # wait 30s for spotSend to settle, then sweep deployer");
    }
}
