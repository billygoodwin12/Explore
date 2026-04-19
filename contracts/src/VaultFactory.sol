// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Vault} from "./Vault.sol";

interface IERC20Factory {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @title VaultFactory
 * @notice EIP-1167 minimal-proxy deployer for Theorise vaults.
 *         Holds no user funds; USDC flows straight from creator to the clone.
 */
contract VaultFactory {
    address public immutable implementation;
    address public immutable usdc;
    address public immutable coreDepositWallet;
    address public immutable protocolTreasury;

    address[] public allVaults;
    mapping(address => address[]) public creatorVaults;

    event VaultCreated(
        address indexed vault,
        address indexed creator,
        uint64 expiryTs,
        uint256 creatorIM
    );

    error ZeroAddress();
    error ExpiryInPast();
    error NoPositions();

    constructor(
        address _implementation,
        address _usdc,
        address _coreDepositWallet,
        address _protocolTreasury
    ) {
        if (
            _implementation == address(0) ||
            _usdc == address(0) ||
            _coreDepositWallet == address(0) ||
            _protocolTreasury == address(0)
        ) revert ZeroAddress();
        implementation = _implementation;
        usdc = _usdc;
        coreDepositWallet = _coreDepositWallet;
        protocolTreasury = _protocolTreasury;
    }

    /// @notice Creator approves `creatorIM` USDC to this factory, then calls
    ///         createVault with their position spec + expiry.
    /// @dev Pulls USDC, clones impl, forwards USDC to the clone, inits it —
    ///      all in one tx so there's no front-run window on initialize().
    function createVault(
        Vault.Position[] calldata positions,
        uint64 expiryTs,
        uint256 creatorIM
    ) external returns (address vault) {
        if (positions.length == 0) revert NoPositions();
        if (expiryTs <= block.timestamp) revert ExpiryInPast();

        // Pull creator's IM through the factory to the new clone.
        vault = Clones.clone(implementation);
        require(
            IERC20Factory(usdc).transferFrom(msg.sender, vault, creatorIM),
            "usdc transferFrom"
        );

        Vault(vault).initialize(
            address(this),
            msg.sender,
            usdc,
            coreDepositWallet,
            protocolTreasury,
            expiryTs,
            positions,
            creatorIM
        );

        allVaults.push(vault);
        creatorVaults[msg.sender].push(vault);
        emit VaultCreated(vault, msg.sender, expiryTs, creatorIM);
    }

    function allVaultsLength() external view returns (uint256) { return allVaults.length; }
    function creatorVaultsLength(address creator) external view returns (uint256) {
        return creatorVaults[creator].length;
    }
}
