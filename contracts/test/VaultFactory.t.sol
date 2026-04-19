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
        p[0] = Vault.Position({ asset: 0, isBuy: true, allocBps: 10_000, lev: 5, szDecimals: 5 });
    }

    function setUp() public {
        usdc = new MockUSDC();
        impl = new Vault();
        factory = new VaultFactory(address(impl), address(usdc), depositWallet, treasury, false, 0);
        usdc.mint(alice, 1_000e6);
        usdc.mint(bob, 1_000e6);
    }

    function _factoryWithFee(uint256 fee) internal returns (VaultFactory) {
        return new VaultFactory(address(impl), address(usdc), depositWallet, treasury, false, fee);
    }

    function test_createVault_clonesAndRegisters() public {
        vm.prank(alice);
        usdc.approve(address(factory), 50e6);
        vm.prank(alice);
        address vault = factory.createVault(_spec(), uint64(block.timestamp + 1 days), 50e6, 0);

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
        factory.createVault(_spec(), uint64(block.timestamp + 1 days), 50e6, 0);

        vm.prank(bob);
        usdc.approve(address(factory), 25e6);
        vm.prank(bob);
        factory.createVault(_spec(), uint64(block.timestamp + 2 days), 25e6, 0);

        assertEq(factory.allVaultsLength(), 2);
        assertEq(factory.creatorVaultsLength(alice), 1);
        assertEq(factory.creatorVaultsLength(bob), 1);
    }

    function test_createVault_revertsOnExpiryInPast() public {
        vm.prank(alice);
        usdc.approve(address(factory), 50e6);
        vm.prank(alice);
        vm.expectRevert(VaultFactory.ExpiryInPast.selector);
        factory.createVault(_spec(), uint64(block.timestamp), 50e6, 0);
    }

    function test_createVault_revertsOnNoPositions() public {
        Vault.Position[] memory empty = new Vault.Position[](0);
        vm.prank(alice);
        usdc.approve(address(factory), 50e6);
        vm.prank(alice);
        vm.expectRevert(VaultFactory.NoPositions.selector);
        factory.createVault(empty, uint64(block.timestamp + 1 days), 50e6, 0);
    }

    function test_factory_holdsNoFunds() public {
        vm.prank(alice);
        usdc.approve(address(factory), 50e6);
        vm.prank(alice);
        address vault = factory.createVault(_spec(), uint64(block.timestamp + 1 days), 50e6, 0);

        assertEq(usdc.balanceOf(address(factory)), 0);
        assertEq(usdc.balanceOf(vault), 50e6);
    }

    function test_deploymentFee_forwardedToTreasury() public {
        uint256 fee = 5e6; // $5
        VaultFactory feeFactory = _factoryWithFee(fee);

        vm.prank(alice);
        usdc.approve(address(feeFactory), 50e6 + fee);
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(alice);
        address vault = feeFactory.createVault(_spec(), uint64(block.timestamp + 1 days), 50e6, 0);

        // Vault got the IM; treasury got the fee; alice paid both.
        assertEq(usdc.balanceOf(vault), 50e6);
        assertEq(usdc.balanceOf(treasury), treasuryBefore + fee);
        assertEq(usdc.balanceOf(alice), aliceBefore - 50e6 - fee);
        assertEq(usdc.balanceOf(address(feeFactory)), 0);
    }

    function test_deploymentFee_zeroSkipsFeeTransfer() public {
        // Default factory in setUp has fee=0. Prove the fee path is a no-op
        // (already covered by existing tests, but pin the intent).
        assertEq(factory.deploymentFee(), 0);

        vm.prank(alice);
        usdc.approve(address(factory), 50e6); // only IM approved
        vm.prank(alice);
        factory.createVault(_spec(), uint64(block.timestamp + 1 days), 50e6, 0);
        // Did not revert — fee transferFrom was skipped.
    }

    function test_deploymentFee_revertsIfApprovalTooLow() public {
        uint256 fee = 5e6;
        VaultFactory feeFactory = _factoryWithFee(fee);

        vm.prank(alice);
        usdc.approve(address(feeFactory), 50e6); // IM only, not IM+fee

        vm.prank(alice);
        vm.expectRevert(); // MockUSDC underflows on unapproved transferFrom
        feeFactory.createVault(_spec(), uint64(block.timestamp + 1 days), 50e6, 0);
    }

    function test_perfFee_storedOnVault() public {
        vm.prank(alice);
        usdc.approve(address(factory), 50e6);
        vm.prank(alice);
        address vault = factory.createVault(_spec(), uint64(block.timestamp + 1 days), 50e6, 1500);
        // 15% perf fee
        assertEq(Vault(vault).perfFeeBps(), 1500);
    }

    function test_perfFee_splitIs20Protocol80Creator() public {
        vm.prank(alice);
        usdc.approve(address(factory), 50e6);
        vm.prank(alice);
        address vault = factory.createVault(_spec(), uint64(block.timestamp + 1 days), 50e6, 1500);

        (uint16 protocolBps, uint16 creatorBps) = Vault(vault).perfFeeSplit();
        assertEq(protocolBps, 2000); // 20% of the perf fee
        assertEq(creatorBps, 8000); // 80% of the perf fee
        assertEq(protocolBps + creatorBps, 10_000);
    }

    function test_perfFee_revertsAbove30pct() public {
        vm.prank(alice);
        usdc.approve(address(factory), 50e6);
        vm.prank(alice);
        vm.expectRevert(Vault.PerfFeeTooHigh.selector);
        factory.createVault(_spec(), uint64(block.timestamp + 1 days), 50e6, 3001);
    }
}
