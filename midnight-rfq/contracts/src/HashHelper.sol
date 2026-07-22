// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;
import {Offer} from "midnight/interfaces/IMidnight.sol";
import {HashLib} from "midnight/ratifiers/libraries/HashLib.sol";
import {EIP712_DOMAIN_TYPEHASH} from "midnight/ratifiers/interfaces/IEcrecoverRatifier.sol";
import {TickLib} from "midnight/libraries/TickLib.sol";
contract HashHelper {
    /// @notice EIP-712 leaf hash of an offer (= Merkle root for a single-offer tree).
    function hashOffer(Offer memory offer) external pure returns (bytes32) {
        return HashLib.hashOffer(offer);
    }
    /// @notice Full signing digest for a single-offer (height-0) tree under the
    /// EcrecoverRatifier's domain. Used to parity-check the frontend's typed data.
    function digestSingle(Offer memory offer, address ratifier) external view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(HashLib.offerTreeTypeHash(0), HashLib.hashOffer(offer)));
        bytes32 domainSeparator = keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, block.chainid, ratifier));
        return keccak256(bytes.concat("\x19\x01", domainSeparator, structHash));
    }
    function tickToPrice(uint256 tick) external pure returns (uint256) {
        return TickLib.tickToPrice(tick);
    }
    /// @dev Among ticks that are multiples of spacing, returns the lowest one
    /// whose price is >= the given WAD price.
    function priceToTick(uint256 priceWad, uint256 spacing) external pure returns (uint256) {
        return TickLib.priceToTick(priceWad, spacing);
    }
}
