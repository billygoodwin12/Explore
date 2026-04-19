// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Vault} from "../src/Vault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {HLConstants} from "../src/HLConstants.sol";

/// Deploys the Vault implementation + VaultFactory on HyperEVM.
/// Default mainnet; set TESTNET=true to flip.
/// First deploy should use CORE_ROUTING=false so USDC stays idle in the vault —
/// lets us validate the end-to-end wizard → factory flow before trusting the
/// CoreWriter scaling assumptions with real funds.
///
/// Run with:
///   forge script script/DeployFactory.s.sol --rpc-url $HYPEREVM_RPC \
///     --private-key $PRIVATE_KEY --broadcast
contract DeployFactory is Script {
    function run() external {
        bool isTestnet = vm.envOr("TESTNET", false);
        bool coreRoutingEnabled = vm.envOr("CORE_ROUTING", false);

        address usdc = isTestnet ? HLConstants.USDC_EVM_TESTNET : HLConstants.USDC_EVM_MAINNET;
        address depositWallet = isTestnet
            ? HLConstants.CORE_DEPOSIT_WALLET_TESTNET
            : HLConstants.CORE_DEPOSIT_WALLET_MAINNET;
        address treasury = vm.envAddress("PROTOCOL_TREASURY");

        vm.startBroadcast();
        Vault impl = new Vault();
        VaultFactory factory = new VaultFactory(
            address(impl),
            usdc,
            depositWallet,
            treasury,
            coreRoutingEnabled
        );
        vm.stopBroadcast();

        console.log("Vault impl    :", address(impl));
        console.log("VaultFactory  :", address(factory));
        console.log("USDC ERC20    :", usdc);
        console.log("Deposit wallet:", depositWallet);
        console.log("Treasury      :", treasury);
        console.log("Core routing  :", coreRoutingEnabled);
    }
}
