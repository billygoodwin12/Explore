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
/// @dev Asset address is read from $USDC_ADDRESS so we can swap mainnet vs
///      testnet without recompiling. Creator defaults to the deployer.
contract DeployCreatorVault is Script {
    function run() external returns (CreatorVault vault) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address creator = vm.envOr("CREATOR_ADDRESS", msg.sender);
        string memory name_ = vm.envOr("VAULT_NAME", string("Theorise Test Vault"));
        string memory symbol_ = vm.envOr("VAULT_SYMBOL", string("tVAULT"));

        vm.startBroadcast();
        vault = new CreatorVault(IERC20(usdc), creator, name_, symbol_);
        vm.stopBroadcast();

        console.log("CreatorVault deployed at:", address(vault));
        console.log("Asset (USDC):", usdc);
        console.log("Creator:", creator);
    }
}
