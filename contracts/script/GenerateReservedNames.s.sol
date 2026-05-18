// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";

/// @notice Generates the bytes32[] reserved-name hash list passed to
///         `Factory`'s constructor. Run:
///
///         forge script script/GenerateReservedNames.s.sol
///
///         The output is the literal `bytes32[] memory reserved =
///         [...]` you can paste into `DeployFactory.s.sol`. Re-run
///         after modifying the `_reservedNames()` source array to
///         regenerate.
///
/// The hash list is reproducible. Auditors can verify by re-running
/// this script against the same name list and comparing the output
/// to the deployment-transaction calldata.
///
/// Provenance discipline: names are stored once in `_reservedNames`
/// below. Any change here ⇒ re-run script ⇒ update deployer ⇒ new
/// factory deployment. The on-chain hash set is immutable post-deploy.
contract GenerateReservedNames is Script {
    function run() external pure {
        string[] memory names = _reservedNames();
        console.log("// %s reserved names. Paste into DeployFactory.s.sol:", names.length);
        console.log("bytes32[] memory reserved = new bytes32[](%s);", names.length);
        for (uint256 i = 0; i < names.length; i++) {
            string memory n = names[i];
            _requireLowercase(n);
            bytes32 h = keccak256(bytes(n));
            console.log("reserved[%s] = bytes32(%s); //", i, vm.toString(h));
            console.log("    %s", n);
        }
    }

    /// @notice Lowercase ASCII canonical list. Categories:
    ///         (a) protocol identifiers,
    ///         (b) common offensive / phishing-bait words,
    ///         (c) single- and two-letter style squat seeds we want
    ///             to keep reserved alongside the 3-char minimum.
    function _reservedNames() internal pure returns (string[] memory n) {
        n = new string[](50);
        // (a) protocol identifiers
        n[0]  = "theorise";
        n[1]  = "theorize";
        n[2]  = "admin";
        n[3]  = "administrator";
        n[4]  = "support";
        n[5]  = "team";
        n[6]  = "official";
        n[7]  = "staff";
        n[8]  = "moderator";
        n[9]  = "mod";
        n[10] = "owner";
        n[11] = "founder";
        n[12] = "ceo";
        n[13] = "treasury";
        n[14] = "vault";
        n[15] = "creator";
        n[16] = "factory";
        n[17] = "protocol";
        n[18] = "system";
        n[19] = "root";
        // (b) phishing / impersonation bait
        n[20] = "help";
        n[21] = "helpdesk";
        n[22] = "security";
        n[23] = "verify";
        n[24] = "verified";
        n[25] = "noreply";
        n[26] = "no_reply";
        n[27] = "info";
        n[28] = "contact";
        n[29] = "abuse";
        n[30] = "legal";
        n[31] = "press";
        n[32] = "media";
        n[33] = "billing";
        n[34] = "payments";
        n[35] = "wallet";
        n[36] = "deposit";
        n[37] = "withdraw";
        n[38] = "bridge";
        n[39] = "claim";
        // (c) common HL / EVM identifiers + numeric/alphabetic squat seeds
        n[40] = "hyperliquid";
        n[41] = "hl";
        n[42] = "usdc";
        n[43] = "hype";
        n[44] = "btc";
        n[45] = "eth";
        n[46] = "sol";
        n[47] = "core";
        n[48] = "evm";
        n[49] = "null";
    }

    function _requireLowercase(string memory s) internal pure {
        bytes memory raw = bytes(s);
        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 c = raw[i];
            // Allow [a-z], [0-9], and '_'. Anything else (uppercase,
            // punctuation, unicode) means the list was edited without
            // care — fail loudly so the deploy uses a clean hash set.
            bool ok = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x5f;
            require(ok, "reserved-name list contains non-lowercase-ASCII byte");
        }
    }
}
