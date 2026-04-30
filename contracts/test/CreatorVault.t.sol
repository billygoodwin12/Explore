// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CreatorVault} from "../src/CreatorVault.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract CreatorVaultTest is Test {
    MockUSDC usdc;
    CreatorVault vault;

    address creator = address(0xC1);
    address alice = address(0xA1);
    address bob = address(0xB0);

    function setUp() public {
        usdc = new MockUSDC();
        vault = new CreatorVault(IERC20(address(usdc)), creator, "Theorise BTC Long", "tVAULT");
        usdc.mint(alice, 1_000e6);
        usdc.mint(bob, 1_000e6);
    }

    function test_deposit_mints_shares_one_to_one_when_empty() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 100e6);
        uint256 shares = vault.deposit(100e6, alice);
        vm.stopPrank();

        assertEq(shares, 100e6, "first depositor: shares == assets");
        assertEq(vault.balanceOf(alice), 100e6);
        assertEq(usdc.balanceOf(address(vault)), 100e6);
    }

    function test_withdraw_returns_all_usdc_when_sole_holder() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);
        uint256 redeemed = vault.redeem(vault.balanceOf(alice), alice, alice);
        vm.stopPrank();

        assertEq(redeemed, 100e6);
        assertEq(usdc.balanceOf(alice), 1_000e6, "alice whole again");
        assertEq(usdc.balanceOf(address(vault)), 0);
        assertEq(vault.totalSupply(), 0);
    }

    function test_two_depositors_split_pro_rata() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 100e6);
        vault.deposit(100e6, alice);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(vault), 200e6);
        vault.deposit(200e6, bob);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), 100e6);
        assertEq(vault.balanceOf(bob), 200e6);
        assertEq(vault.totalAssets(), 300e6);

        uint256 aliceShares = vault.balanceOf(alice);
        vm.prank(alice);
        uint256 aliceOut = vault.redeem(aliceShares, alice, alice);
        assertEq(aliceOut, 100e6, "alice gets her stake");
    }

    function test_creator_recorded() public view {
        assertEq(vault.creator(), creator);
    }
}
