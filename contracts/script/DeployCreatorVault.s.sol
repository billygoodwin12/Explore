// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CreatorVault} from "../src/CreatorVault.sol";
import {HLConstants} from "../src/HLConstants.sol";

/// @notice Deploy a single CreatorVault to HyperEVM (mainnet or testnet).
///         Auto-selects the CoreDepositWallet by chainid; override via
///         CDW_ADDRESS env var.
contract DeployCreatorVault is Script {
    function run() external returns (CreatorVault vault) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address creator = vm.envOr("CREATOR_ADDRESS", msg.sender);
        address admin = vm.envOr("ADMIN_ADDRESS", msg.sender);
        string memory name_ = vm.envOr("VAULT_NAME", string("Theorise Test Vault"));
        string memory symbol_ = vm.envOr("VAULT_SYMBOL", string("tVAULT"));
        address cdw = vm.envOr("CDW_ADDRESS", _cdwForChain(block.chainid));
        require(cdw != address(0), "CDW_ADDRESS unset for unknown chainid");

        vm.startBroadcast();
        // factory_ = address(0): direct (non-factory) deploy; the vault's
        // `bootstrapDeposit` entry point is permanently locked and the
        // README pre-activation runbook applies as before.
        vault = new CreatorVault(IERC20(usdc), creator, admin, cdw, address(0), name_, symbol_);
        vm.stopBroadcast();

        console.log("CreatorVault deployed at:", address(vault));
        console.log("Asset (USDC):", usdc);
        console.log("CoreDepositWallet:", cdw);
        console.log("Creator:", creator);
        console.log("Admin (owner):", admin);
        console.log("");
        console.log("Next steps:");
        console.log("  1. (Recommended) Run MainnetBridgeProbe.s.sol with a fresh");
        console.log("     EOA before exposing this vault to users, to confirm CDW");
        console.log("     credits Core spot on the deployment network.");
        console.log("  2. Users approve USDC, call deposit(amount, receiver).");
    }

    function _cdwForChain(uint256 cid) internal pure returns (address) {
        if (cid == 999) return HLConstants.CORE_DEPOSIT_WALLET_MAINNET;
        if (cid == 998) return HLConstants.CORE_DEPOSIT_WALLET_TESTNET;
        return address(0);
    }
}
