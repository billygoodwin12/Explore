// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {PerpOrderSpike} from "../src/PerpOrderSpike.sol";
import {HLConstants} from "../src/HLConstants.sol";

/// Run with:
///   forge script script/DeploySpike.s.sol --rpc-url $HYPEREVM_TESTNET_RPC \
///     --private-key $PRIVATE_KEY --broadcast
contract DeploySpike is Script {
    function run() external {
        // Default = mainnet (matches the rest of the platform). Set TESTNET=true to flip.
        bool isTestnet = vm.envOr("TESTNET", false);
        address usdc = isTestnet ? HLConstants.USDC_EVM_TESTNET : HLConstants.USDC_EVM_MAINNET;
        address depositWallet = isTestnet
            ? HLConstants.CORE_DEPOSIT_WALLET_TESTNET
            : HLConstants.CORE_DEPOSIT_WALLET_MAINNET;

        vm.startBroadcast();
        PerpOrderSpike spike = new PerpOrderSpike(usdc, depositWallet);
        vm.stopBroadcast();

        console.log("PerpOrderSpike deployed at", address(spike));
        console.log("USDC ERC20", usdc);
        console.log("Core deposit wallet", depositWallet);
    }
}
