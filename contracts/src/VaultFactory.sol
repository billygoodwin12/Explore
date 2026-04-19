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
 *
 *         `coreRoutingEnabled` is pinned at factory construction — all vaults
 *         this factory creates share the same setting. To flip on/off, deploy
 *         a new factory pointing at the same impl.
 */
contract VaultFactory {
    address public immutable implementation;
    address public immutable usdc;
    address public immutable coreDepositWallet;
    address public immutable protocolTreasury;
    bool public immutable coreRoutingEnabled;
    /// Flat USDC fee (6dp) pulled from the creator at createVault and forwarded
    /// to protocolTreasury. Covers our keeper gas + platform margin. Immutable
    /// — flip by deploying a new factory.
    uint256 public immutable deploymentFee;

    address[] public allVaults;
    mapping(address => address[]) public creatorVaults;

    event VaultCreated(
        address indexed vault,
        address indexed creator,
        uint64 expiryTs,
        uint256 creatorIM,
        uint256 deploymentFee
    );

    error ZeroAddress();
    error ExpiryInPast();
    error NoPositions();

    constructor(
        address _implementation,
        address _usdc,
        address _coreDepositWallet,
        address _protocolTreasury,
        bool _coreRoutingEnabled,
        uint256 _deploymentFee
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
        coreRoutingEnabled = _coreRoutingEnabled;
        deploymentFee = _deploymentFee;
    }

    function createVault(
        Vault.Position[] calldata positions,
        uint64 expiryTs,
        uint256 creatorIM
    ) external returns (address vault) {
        if (positions.length == 0) revert NoPositions();
        if (expiryTs <= block.timestamp) revert ExpiryInPast();

        vault = Clones.clone(implementation);

        // Pull creatorIM → vault (skin-in-the-game, locked until settle).
        require(
            IERC20Factory(usdc).transferFrom(msg.sender, vault, creatorIM),
            "usdc transferFrom"
        );
        // Pull deploymentFee → treasury (platform revenue). Kept out of vault
        // share math so it doesn't dilute depositors.
        if (deploymentFee > 0) {
            require(
                IERC20Factory(usdc).transferFrom(msg.sender, protocolTreasury, deploymentFee),
                "usdc fee"
            );
        }

        Vault(vault).initialize(
            address(this),
            msg.sender,
            usdc,
            coreDepositWallet,
            protocolTreasury,
            expiryTs,
            coreRoutingEnabled,
            positions,
            creatorIM
        );

        allVaults.push(vault);
        creatorVaults[msg.sender].push(vault);
        emit VaultCreated(vault, msg.sender, expiryTs, creatorIM, deploymentFee);
    }

    function allVaultsLength() external view returns (uint256) { return allVaults.length; }
    function creatorVaultsLength(address creator) external view returns (uint256) {
        return creatorVaults[creator].length;
    }
}
