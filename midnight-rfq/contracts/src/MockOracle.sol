// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
/// @notice Fixed price oracle, settable by owner. Returns price of 1 base unit
/// of collateral in base units of loan token, scaled by 1e36:
/// price = humanPrice * 10^(36 + loanDecimals - collateralDecimals)
contract MockOracle {
    address public immutable owner;
    uint256 public price;
    constructor(uint256 _price) {
        owner = msg.sender;
        price = _price;
    }
    function setPrice(uint256 _price) external {
        require(msg.sender == owner, "not owner");
        price = _price;
    }
}
