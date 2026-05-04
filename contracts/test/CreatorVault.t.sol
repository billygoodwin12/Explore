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

    address admin = address(0xAD);
    address creator = address(0xC1);
    address treasury = address(0xFEE);
    address alice = address(0xA1);
    address bob = address(0xB0);

    function setUp() public {
        usdc = new MockUSDC();
        vault = new CreatorVault(IERC20(address(usdc)), creator, admin, "Theorise BTC Long", "tVAULT");
        usdc.mint(creator, 100_000e6);
        usdc.mint(alice, 100_000e6);
        usdc.mint(bob, 100_000e6);
    }

    // ─── Helpers ────────────────────────────────────────────────────

    function _seedCreator(uint256 amount) internal {
        vm.startPrank(creator);
        usdc.approve(address(vault), amount);
        vault.deposit(amount, creator);
        vm.stopPrank();
    }

    function _depositAs(address who, uint256 amount) internal returns (uint256 shares) {
        vm.startPrank(who);
        usdc.approve(address(vault), amount);
        shares = vault.deposit(amount, who);
        vm.stopPrank();
    }

    // ─── Round-trip basics ──────────────────────────────────────────

    function test_creator_stored() public view {
        assertEq(vault.CREATOR(), creator);
    }

    function test_admin_is_owner() public view {
        assertEq(vault.owner(), admin);
    }

    function test_creator_first_deposit_mints_one_to_one() public {
        uint256 shares = _depositAs(creator, 500e6);
        assertEq(shares, 500e6);
        assertEq(vault.balanceOf(creator), 500e6);
        assertEq(usdc.balanceOf(address(vault)), 500e6);
    }

    function test_creator_can_withdraw_when_alone() public {
        _depositAs(creator, 500e6);
        uint256 sh = vault.balanceOf(creator);
        vm.prank(creator);
        uint256 out = vault.redeem(sh, creator, creator);
        assertEq(out, 500e6);
        assertEq(vault.totalSupply(), 0);
    }

    // ─── Creator stake invariant ────────────────────────────────────

    function test_invariant_cap_binds_above_threshold() public {
        // Creator stakes exactly $100 (the cap). Vault grows past $500
        // → 20% > $100 → cap binds → followers can keep depositing
        // without the creator topping up.
        _seedCreator(100e6);
        _depositAs(bob, 400e6); // vault = $500, 20% = cap
        _depositAs(alice, 10_000e6); // vault = $10,500. Cap still binds.
        assertEq(vault.totalAssets(), 10_500e6);

        // Creator's stake is still $100, which equals the cap → ok.
        uint256 creatorAssets = vault.convertToAssets(vault.balanceOf(creator));
        assertEq(creatorAssets, 100e6);
    }

    function test_invariant_pct_binds_below_threshold() public {
        // Below cap-threshold ($500), 20% rule binds. Creator at $20 →
        // followers maxed at 4x = $80 → vault = $100 (creator at 20%).
        _seedCreator(20e6);
        _depositAs(bob, 80e6);
        assertEq(vault.totalAssets(), 100e6);

        // Any more would push creator under 20% (and 20% < cap, so 20%
        // binds, not cap).
        vm.startPrank(alice);
        usdc.approve(address(vault), 1e6);
        vm.expectRevert();
        vault.deposit(1e6, alice);
        vm.stopPrank();
    }

    function test_invariant_creator_top_up_below_threshold() public {
        // Below the cap-threshold the 20% rule binds. Creator can unlock
        // more follower capacity by adding to their own stake.
        _seedCreator(20e6); // vault $20, 20% rule active
        _depositAs(bob, 80e6); // vault $100, creator at 20%
        // Alice can't deposit (would push creator under 20%).
        vm.startPrank(alice);
        usdc.approve(address(vault), 1e6);
        vm.expectRevert();
        vault.deposit(1e6, alice);
        vm.stopPrank();

        // Creator tops up another $20 → creator $40, vault $120, 33%.
        // Alice can now deposit up to $80 (creator $40 of $200 = 20%).
        _depositAs(creator, 20e6);
        _depositAs(alice, 80e6);
        assertEq(vault.totalAssets(), 200e6);
    }

    function test_invariant_creator_can_only_withdraw_above_minimum() public {
        _seedCreator(1_000e6);
        _depositAs(bob, 4_000e6); // creator at 20%

        // Creator tries to redeem any shares → drops below 20% → reverts.
        uint256 sh = vault.balanceOf(creator);
        vm.startPrank(creator);
        vm.expectRevert();
        vault.redeem(sh, creator, creator);
        vm.stopPrank();
    }

    function test_invariant_follower_withdrawal_unaffected() public {
        _seedCreator(1_000e6);
        _depositAs(bob, 4_000e6);

        // Bob withdrawing raises creator's % → no revert.
        uint256 sh = vault.balanceOf(bob);
        vm.prank(bob);
        uint256 out = vault.redeem(sh, bob, bob);
        assertEq(out, 4_000e6);
    }

    // ─── Deposit fee ────────────────────────────────────────────────

    function test_fee_defaults_to_zero() public {
        assertEq(vault.depositFeeBps(), 0);
        assertEq(vault.feeRecipient(), address(0));
    }

    function test_admin_can_set_fee() public {
        vm.prank(admin);
        vault.setDepositFee(50, treasury); // 0.5%
        assertEq(vault.depositFeeBps(), 50);
        assertEq(vault.feeRecipient(), treasury);
    }

    function test_non_admin_cannot_set_fee() public {
        vm.prank(creator);
        vm.expectRevert();
        vault.setDepositFee(50, treasury);
    }

    function test_fee_cap_enforced() public {
        vm.prank(admin);
        vm.expectRevert();
        vault.setDepositFee(1001, treasury); // > 10%
    }

    function test_fee_skims_to_recipient_on_deposit() public {
        _seedCreator(10_000e6);

        vm.prank(admin);
        vault.setDepositFee(100, treasury); // 1%

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        _depositAs(bob, 1_000e6);

        // 1% of $1,000 = $10 to treasury, $990 to vault for bob's shares.
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, 10e6);
        // Vault holds creator's $10,000 plus bob's net $990.
        assertEq(usdc.balanceOf(address(vault)), 10_990e6);
    }

    function test_fee_zero_recipient_disables_skim() public {
        _seedCreator(10_000e6);

        vm.prank(admin);
        vault.setDepositFee(100, address(0)); // bps set but no recipient

        _depositAs(bob, 1_000e6);
        // No skim — full $1,000 in vault.
        assertEq(usdc.balanceOf(address(vault)), 11_000e6);
    }

    function test_two_depositors_split_pro_rata_no_fee() public {
        _seedCreator(1_000e6);
        _depositAs(bob, 4_000e6);

        assertEq(vault.balanceOf(creator), 1_000e6);
        assertEq(vault.balanceOf(bob), 4_000e6);
        assertEq(vault.totalAssets(), 5_000e6);

        // Bob redeems → gets $4,000 back.
        uint256 sh = vault.balanceOf(bob);
        vm.prank(bob);
        uint256 out = vault.redeem(sh, bob, bob);
        assertEq(out, 4_000e6);
    }
}
