// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CreatorVault} from "../src/CreatorVault.sol";

/// @notice Deploy a single CreatorVault to HyperEVM testnet (or mainnet).
///         Usage:
///           forge script script/DeployCreatorVault.s.sol \
///             --rpc-url hyperevm_testnet \
///             --private-key $PRIVATE_KEY \
///             --broadcast
///
/// @dev USDC address comes from env (used as denomination label only —
///      vault holds no EVM USDC, deposits/redeems are Core-side).
///      Creator + admin default to the deployer.
contract DeployCreatorVault is Script {
    function run() external returns (CreatorVault vault) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address creator = vm.envOr("CREATOR_ADDRESS", msg.sender);
        address admin = vm.envOr("ADMIN_ADDRESS", msg.sender);
        string memory name_ = vm.envOr("VAULT_NAME", string("Theorise Test Vault"));
        string memory symbol_ = vm.envOr("VAULT_SYMBOL", string("tVAULT"));

        vm.startBroadcast();
        vault = new CreatorVault(IERC20(usdc), creator, admin, name_, symbol_);
        vm.stopBroadcast();

        console.log("CreatorVault deployed at:", address(vault));
        console.log("Asset (USDC label):", usdc);
        console.log("Creator:", creator);
        console.log("Admin (owner):", admin);
        console.log("");
        console.log("Next steps:");
        console.log("  1. Send 1+ USDC EOA Core -> vault Core to activate.");
        console.log("  2. Followers send USDC to vault Core, then call");
        console.log("     depositCore(receiver, minShares) on EVM to claim shares.");
    }
}
