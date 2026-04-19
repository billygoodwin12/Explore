// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vault} from "../src/Vault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += a; return true;
    }
}

contract VaultFactoryTest is Test {
    MockUSDC usdc;
    VaultFactory factory;
    Vault impl;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address treasury = address(0xFEE5);
    address depositWallet = address(0xD1ED);

    function _spec() internal pure returns (Vault.Position[] memory p) {
        p = new Vault.Position[](1);
        p[0] = Vault.Position({ asset: 0, isBuy: true, allocBps: 10_000, lev: 5 });
    }

    function setUp() public {
        usdc = new MockUSDC();
        impl = new Vault();
        factory = new VaultFactory(address(impl), address(usdc), depositWallet, treasury);
        usdc.mint(alice, 1_000e6);
        usdc.mint(bob, 1_000e6);
    }

    function test_createVault_clonesAndRegisters() public {
        vm.prank(alice);
        usdc.approve(address(factory), 50e6);
        vm.prank(alice);
        address vault = factory.createVault(_spec(), uint64(block.timestamp + 1 days), 50e6);

        assertEq(factory.allVaultsLength(), 1);
        assertEq(factory.creatorVaultsLength(alice), 1);
        assertEq(factory.allVaults(0), vault);
        assertEq(Vault(vault).creator(), alice);
        assertEq(Vault(vault).factory(), address(factory));
    }

    function test_createVault_twoCreatorsIndependent() public {
        vm.prank(alice);
        usdc.approve(address(factory), 50e6);
        vm.prank(alice);
        factory.createVault(_spec(), uint64(block.timestamp + 1 days), 50e6);

        vm.prank(bob);
        usdc.approve(address(factory), 25e6);
        vm.prank(bob);
        factory.createVault(_spec(), uint64(block.timestamp + 2 days), 25e6);

        assertEq(factory.allVaultsLength(), 2);
        assertEq(factory.creatorVaultsLength(alice), 1);
        assertEq(factory.creatorVaultsLength(bob), 1);
    }

    function test_createVault_revertsOnExpiryInPast() public {
        vm.prank(alice);
        usdc.approve(address(factory), 50e6);
        vm.prank(alice);
        vm.expectRevert(VaultFactory.ExpiryInPast.selector);
        factory.createVault(_spec(), uint64(block.timestamp), 50e6);
    }

    function test_createVault_revertsOnNoPositions() public {
        Vault.Position[] memory empty = new Vault.Position[](0);
        vm.prank(alice);
        usdc.approve(address(factory), 50e6);
        vm.prank(alice);
        vm.expectRevert(VaultFactory.NoPositions.selector);
        factory.createVault(empty, uint64(block.timestamp + 1 days), 50e6);
    }

    function test_factory_holdsNoFunds() public {
        vm.prank(alice);
        usdc.approve(address(factory), 50e6);
        vm.prank(alice);
        address vault = factory.createVault(_spec(), uint64(block.timestamp + 1 days), 50e6);

        assertEq(usdc.balanceOf(address(factory)), 0);
        assertEq(usdc.balanceOf(vault), 50e6);
    }
}
