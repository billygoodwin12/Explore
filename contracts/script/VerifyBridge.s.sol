// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {HLConstants, ICoreWriter} from "../src/HLConstants.sol";

/// @notice Minimal probe deployed by the script. Holds USDC, fires a bridge
///         attempt at the per-token system address, and exposes precompile
///         reads for the script to verify settlement.
contract BridgeProbe {
    using SafeERC20 for IERC20;

    address public immutable USDC;
    address public immutable OWNER;

    error NotOwner();
    error BridgeFailed(bytes reason);

    constructor(address usdc) {
        USDC = usdc;
        OWNER = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != OWNER) revert NotOwner();
        _;
    }

    /// @notice Fire the proposed bridge mechanism: ERC-20 transfer to
    ///         per-token system address. This is exactly the call the
    ///         migration doc proposes inside `deposit()`.
    function bridgeViaSystemAddress(uint256 amount) external onlyOwner {
        SafeERC20.safeTransfer(IERC20(USDC), HLConstants.USDC_SYSTEM_ADDRESS, amount);
    }

    /// @notice Reverse direction: send USDC from this contract's Core spot
    ///         back to its own EVM address via CoreWriter action 6 (spotSend).
    ///         Used in the round-trip test.
    function spotSendBackToEvm(uint64 amount8) external onlyOwner {
        bytes memory payload = abi.encode(
            HLConstants.USDC_SYSTEM_ADDRESS,
            HLConstants.USDC_SPOT_INDEX,
            amount8
        );
        bytes memory data = bytes.concat(
            bytes1(0x01),
            bytes3(HLConstants.ACTION_SPOT_SEND),
            payload
        );
        ICoreWriter(HLConstants.CORE_WRITER).sendRawAction(data);
    }

    /// @notice Read this contract's Core spot USDC balance via precompile.
    ///         Returns balance in 6-dec EVM units (8-dec native / 100).
    function coreSpotUSDC() external view returns (uint256) {
        (bool ok, bytes memory data) = HLConstants.SPOT_BALANCE_PRECOMPILE.staticcall(
            abi.encode(address(this), HLConstants.USDC_SPOT_INDEX)
        );
        require(ok, "spot precompile failed");
        (uint64 total,,) = abi.decode(data, (uint64, uint64, uint64));
        return uint256(total) / 100;
    }

    function evmUSDC() external view returns (uint256) {
        return IERC20(USDC).balanceOf(address(this));
    }
}

/// @title  VerifyBridge — empirical test of the EVM → Core bridge mechanism
///         proposed in THEORISE_EVM_DEPOSIT_MIGRATION.md §3.3.
/// @notice This script exists to answer one binary question: when a contract
///         transfers USDC to `USDC_SYSTEM_ADDRESS`, does the contract's Core
///         spot balance increase?
///
///         History (per INVESTIGATION_EVM_DEPOSIT.md):
///         - April 28: testnet probe of legacy bridge wallet showed
///           "tx succeeding on-chain but no Core spot credit ever landing".
///         - May 8: direct ERC-20 transfer to system address from a contract
///           reverted with "Blacklistable: account is blacklisted".
///         - May 9: Circle's CoreDepositWallet.depositFor silently failed
///           for 2 and 6 USDC; the apparent 5-USDC success was attributed
///           to a parallel EOA UI activation send.
///
///         This script will reproduce or refute those findings.
///
/// @dev    `run()` — deploy + transfer + emit; Bill polls externally.
///         `runWithAmount(uint256)` — same with a custom amount.
///
/// Usage:
///   export $(grep -v '^#' .env | xargs)
///   forge script script/VerifyBridge.s.sol \
///     --sig "run()" \
///     --rpc-url $HYPEREVM_TESTNET_RPC \
///     --private-key $PRIVATE_KEY --broadcast --legacy
///
/// After running:
///   1. Capture the deployed BridgeProbe address from the script output.
///   2. Wait 60+ seconds.
///   3. Read `coreSpotUSDC()` on the probe via cast.
///   4. Update INVESTIGATION_EVM_DEPOSIT.md §6 with results.
contract VerifyBridge is Script {
    /// @notice The amount we bridge in this test. Default 5 USDC matches
    ///         the May 9 attempt-1 size.
    uint256 public constant DEFAULT_TEST_AMOUNT = 5_000_000;

    function run() external returns (address probeAddr, bytes32 bridgeTxId) {
        return _runOnce(DEFAULT_TEST_AMOUNT);
    }

    /// @notice Run with a specific test amount. Useful for ruling out a
    ///         per-amount minimum (e.g. test with 100 USDC if 5 USDC fails).
    function runWithAmount(uint256 amount) external returns (address probeAddr, bytes32 bridgeTxId) {
        return _runOnce(amount);
    }

    function _runOnce(uint256 amount) internal returns (address probeAddr, bytes32 bridgeTxId) {
        require(amount > 0, "amount=0");

        address usdc = vm.envAddress("USDC_ADDRESS");
        address eoa = msg.sender;

        console.log("=== VerifyBridge ===");
        console.log("EOA / probe deployer:", eoa);
        console.log("USDC token (EVM):", usdc);
        console.log("Test amount (6-dec USDC):", amount);

        uint256 eoaUsdcBefore = IERC20(usdc).balanceOf(eoa);
        require(eoaUsdcBefore >= amount, "EOA USDC balance insufficient for test");

        vm.startBroadcast();

        // 1. Deploy a fresh probe contract.
        BridgeProbe probe = new BridgeProbe(usdc);
        probeAddr = address(probe);
        console.log("BridgeProbe deployed at:", probeAddr);

        // 2. Fund the probe with `amount` USDC from the EOA on EVM.
        SafeERC20.safeTransfer(IERC20(usdc), probeAddr, amount);
        console.log("Funded probe with USDC (EVM-side).");

        // 3. Probe attempts the bridge. This is the moment of truth.
        //
        //    On testnet (per May 8 evidence): this MAY revert with
        //    Circle's "Blacklistable: account is blacklisted". If it
        //    does, the script aborts and Bill knows direct-transfer
        //    is still blocked.
        //
        //    If it succeeds (no revert), Bill needs to wait + poll
        //    Core spot to see if credit lands. The next steps print
        //    the cast commands to do that.
        try probe.bridgeViaSystemAddress(amount) {
            console.log("");
            console.log("Bridge tx accepted on EVM. Outcome unknown until Core settles.");
            console.log("");
            console.log("Now run these commands to check Core settlement:");
            console.log("");
            console.log(string.concat(
                "  export PROBE=", vm.toString(probeAddr)
            ));
            console.log("");
            console.log("  # EVM USDC balance of probe (should be 0)");
            console.log("  cast call $PROBE \"evmUSDC()(uint256)\" --rpc-url $HYPEREVM_TESTNET_RPC");
            console.log("");
            console.log("  # Core spot USDC balance (should be the test amount, in 6-dec)");
            console.log("  cast call $PROBE \"coreSpotUSDC()(uint256)\" --rpc-url $HYPEREVM_TESTNET_RPC");
            console.log("");
            console.log("  # Or via HL JSON API:");
            console.log(string.concat(
                "  curl -s -X POST https://api.hyperliquid-testnet.xyz/info \\\n",
                "    -H 'Content-Type: application/json' \\\n",
                "    -d '{\"type\":\"spotClearinghouseState\",\"user\":\"",
                vm.toString(probeAddr),
                "\"}'"
            ));
            console.log("");
            console.log("Wait at least 60s before checking -- CoreWriter actions are async.");
            console.log("If credit lands: Path A confirmed. Migration is safe to proceed.");
            console.log("If credit never lands within 5 minutes: Path C -- silent failure.");
        } catch (bytes memory reason) {
            console.log("");
            console.log("Bridge tx REVERTED on EVM. Direct-transfer path is blocked.");
            console.log("Revert reason (raw bytes):");
            console.logBytes(reason);
            console.log("");
            console.log("If reason contains 'Blacklistable: account is blacklisted',");
            console.log("Circle's USDC blacklist on the system address is still active.");
            console.log("Path C -- Migration's direct-transfer assumption is invalid.");
            console.log("");
            console.log("Decision tree from INVESTIGATION_EVM_DEPOSIT.md sec 4:");
            console.log("  - Stay with relayer architecture (prior audit's PR 2), OR");
            console.log("  - Re-test on mainnet (Circle blacklist policy may differ).");
            revert("Bridge reverted - see logs above");
        }

        vm.stopBroadcast();

        bridgeTxId = bytes32(0); // foundry doesn't expose tx hashes inline; check broadcast log

        console.log("");
        console.log("=== Done ===");
        console.log("Update INVESTIGATION_EVM_DEPOSIT.md sec 6 with the results.");
    }
}
