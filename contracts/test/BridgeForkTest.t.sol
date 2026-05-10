// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {HLConstants} from "../src/HLConstants.sol";

contract BridgeProbe {
    using SafeERC20 for IERC20;

    address public immutable USDC;

    constructor(address usdc) { USDC = usdc; }

    function bridge(uint256 amount) external {
        IERC20(USDC).safeTransfer(HLConstants.USDC_SYSTEM_ADDRESS, amount);
    }
}

/// @notice Phase 1 of the bridge-verification protocol. Mainnet fork test.
///         Answers ONE question: does ERC-20 `transfer(USDC_SYSTEM_ADDRESS, X)`
///         from a contract revert on HyperEVM MAINNET against real Circle USDC?
///
///         CANNOT answer the second question (does Core actually credit the
///         contract's spot balance) — that requires a real on-chain probe with
///         a precompile read, which a fork cannot simulate. See
///         contracts/script/MainnetBridgeProbe.s.sol for Phase 2.
///
/// Run:
///   forge test --match-contract BridgeForkTest \
///     --fork-url https://rpc.hyperliquid.xyz/evm -vvv
contract BridgeForkTest is Test {
    address constant MAINNET_USDC = 0xb88339CB7199b77E23DB6E890353E22632Ba630f;

    function test_mainnet_evm_side_does_not_revert() public {
        BridgeProbe probe = new BridgeProbe(MAINNET_USDC);

        deal(MAINNET_USDC, address(probe), 100e6);
        assertEq(IERC20(MAINNET_USDC).balanceOf(address(probe)), 100e6, "deal failed");

        uint256 sysBefore = IERC20(MAINNET_USDC).balanceOf(HLConstants.USDC_SYSTEM_ADDRESS);

        probe.bridge(50e6);

        assertEq(
            IERC20(MAINNET_USDC).balanceOf(address(probe)),
            50e6,
            "probe USDC after bridge"
        );
        assertEq(
            IERC20(MAINNET_USDC).balanceOf(HLConstants.USDC_SYSTEM_ADDRESS),
            sysBefore + 50e6,
            "system address USDC delta"
        );
    }
}
