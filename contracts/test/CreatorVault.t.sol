// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CreatorVault} from "../src/CreatorVault.sol";
import {HLConstants} from "../src/HLConstants.sol";

/// @dev USDC label only — vault never actually holds EVM USDC; deposits
///      and redeems happen on HyperCore. We pass this address to ERC4626's
///      constructor so `asset()` has a valid 6-dec ERC20 to introspect.
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
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
        vault = new CreatorVault(
            IERC20(address(usdc)),
            creator,
            admin,
            "Theorise BTC Long",
            "tVAULT"
        );

        // CoreWriter precompile doesn't exist in unit tests; mock so any
        // outbound action returns successfully.
        vm.mockCall(HLConstants.CORE_WRITER, bytes(""), bytes(""));

        // Default Core balances = 0 for vault, perp accountValue = 0.
        _setCoreSpot(0);
        _setCorePerp(0);
    }

    // ─── Mock helpers ───────────────────────────────────────────────────────

    /// @dev Set vault's HyperCore spot USDC balance (in 6-dec EVM units).
    function _setCoreSpot(uint256 sixDec) internal {
        uint64 total8 = uint64(sixDec * 100);
        vm.mockCall(
            HLConstants.SPOT_BALANCE_PRECOMPILE,
            abi.encode(address(vault), HLConstants.USDC_SPOT_INDEX),
            abi.encode(total8, uint64(0), uint64(0))
        );
    }

    /// @dev Set vault's HyperCore perp accountValue (in 6-dec EVM units).
    function _setCorePerp(uint256 sixDec) internal {
        int64 accountValue8 = int64(uint64(sixDec * 100));
        vm.mockCall(
            HLConstants.ACCOUNT_MARGIN_SUMMARY_PRECOMPILE,
            abi.encode(uint32(0), address(vault)),
            abi.encode(accountValue8, uint64(0), int64(0), int64(0))
        );
    }

    // ─── Deploy invariants ────────────────────────────────────────────────

    function test_creator_stored() public view {
        assertEq(vault.CREATOR(), creator);
    }

    function test_admin_is_owner() public view {
        assertEq(vault.owner(), admin);
    }

    function test_asset_is_usdc() public view {
        assertEq(vault.asset(), address(usdc));
    }

    function test_share_decimals() public view {
        // ERC4626 default: asset.decimals() + _decimalsOffset() = 6 + 6 = 12
        assertEq(vault.decimals(), 12);
    }

    // ─── Standard ERC-4626 surface neutered ──────────────────────────────

    function test_standard_deposit_reverts() public {
        vm.expectRevert(CreatorVault.UseCoreFlow.selector);
        vault.deposit(1, alice);
    }

    function test_standard_mint_reverts() public {
        vm.expectRevert(CreatorVault.UseCoreFlow.selector);
        vault.mint(1, alice);
    }

    function test_standard_withdraw_reverts() public {
        vm.expectRevert(CreatorVault.UseCoreFlow.selector);
        vault.withdraw(1, alice, alice);
    }

    function test_standard_redeem_reverts() public {
        vm.expectRevert(CreatorVault.UseCoreFlow.selector);
        vault.redeem(1, alice, alice);
    }

    function test_max_methods_return_zero() public view {
        assertEq(vault.maxDeposit(alice), 0);
        assertEq(vault.maxMint(alice), 0);
        assertEq(vault.maxWithdraw(alice), 0);
        assertEq(vault.maxRedeem(alice), 0);
    }

    function test_preview_methods_revert() public {
        vm.expectRevert(CreatorVault.UseCoreFlow.selector);
        vault.previewDeposit(1);

        vm.expectRevert(CreatorVault.UseCoreFlow.selector);
        vault.previewMint(1);

        vm.expectRevert(CreatorVault.UseCoreFlow.selector);
        vault.previewWithdraw(1);

        vm.expectRevert(CreatorVault.UseCoreFlow.selector);
        vault.previewRedeem(1);
    }

    // ─── depositCore happy paths ────────────────────────────────────────

    function test_first_deposit_mints_with_offset() public {
        // Creator sent 100 USDC to vault Core (mocked).
        _setCoreSpot(100e6);

        vm.prank(creator);
        uint256 shares = vault.depositCore(creator, 0);

        // First deposit: net 100e6, supply 0, preAssets 0
        // shares = 100e6 * (0 + 1e6) / (0 + 1) = 1e14
        assertEq(shares, 1e14);
        assertEq(vault.balanceOf(creator), 1e14);
        assertEq(vault.lastSeenCoreSpot(), 100e6);
    }

    function test_second_deposit_pro_rata() public {
        // Seed creator with 100 USDC.
        _setCoreSpot(100e6);
        vm.prank(creator);
        vault.depositCore(creator, 0);

        // Bob now sends 50 USDC (cumulative spot: 150).
        _setCoreSpot(150e6);
        vm.prank(bob);
        uint256 shares = vault.depositCore(bob, 0);

        // pre supply = 1e14, pre assets = 100e6, net = 50e6
        // shares ≈ 50e6 * 1e14 / 1e8 = 5e13
        assertApproxEqAbs(shares, 5e13, 1e6);
        assertEq(vault.balanceOf(bob), shares);
    }

    function test_no_delta_reverts() public {
        _setCoreSpot(0);
        vm.prank(creator);
        vm.expectRevert(CreatorVault.NoDeposit.selector);
        vault.depositCore(creator, 0);
    }

    function test_min_shares_slippage_reverts() public {
        _setCoreSpot(100e6);
        vm.prank(creator);
        vm.expectRevert(); // SlippageExceeded
        vault.depositCore(creator, 1e15);
    }

    // ─── Deposit fee ────────────────────────────────────────────────

    function test_fee_defaults_to_zero() public view {
        assertEq(vault.depositFeeBps(), 0);
        assertEq(vault.feeRecipient(), address(0));
    }

    function test_admin_can_set_fee() public {
        vm.prank(admin);
        vault.setDepositFee(50, treasury);
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
        vault.setDepositFee(1001, treasury);
    }

    function test_fee_skims_on_deposit() public {
        vm.prank(admin);
        vault.setDepositFee(100, treasury); // 1%

        // Creator sends 100 USDC. Fee = 1, net = 99.
        _setCoreSpot(100e6);

        vm.prank(creator);
        uint256 shares = vault.depositCore(creator, 0);

        // Shares minted on net (99 USDC).
        assertEq(shares, 99e6 * 1e6);
        // Watermark = currentSpot - fee = 99e6 (fee will leave when spotSend settles)
        assertEq(vault.lastSeenCoreSpot(), 99e6);
    }

    function test_fee_zero_recipient_disables_skim() public {
        vm.prank(admin);
        vault.setDepositFee(100, address(0));

        _setCoreSpot(100e6);
        vm.prank(creator);
        uint256 shares = vault.depositCore(creator, 0);

        // No fee skim since recipient is zero.
        assertEq(shares, 100e6 * 1e6);
        assertEq(vault.lastSeenCoreSpot(), 100e6);
    }

    // ─── Creator stake invariant ────────────────────────────────────────────

    function test_invariant_pct_binds_below_threshold() public {
        // Below cap-threshold ($500): 20% rule binds.
        // Creator at $20 → followers maxed at 4× = $80.
        _setCoreSpot(20e6);
        vm.prank(creator);
        vault.depositCore(creator, 0);

        _setCoreSpot(100e6);
        vm.prank(bob);
        vault.depositCore(bob, 0);

        // Alice tries to deposit 1 USDC — would push creator under 20%.
        _setCoreSpot(101e6);
        vm.prank(alice);
        vm.expectRevert();
        vault.depositCore(alice, 0);
    }

    function test_invariant_cap_binds_above_threshold() public {
        // Creator at exactly $100 cap. Once vault > $500, only cap binds
        // → followers can deposit freely without creator topping up.
        _setCoreSpot(100e6);
        vm.prank(creator);
        vault.depositCore(creator, 0);

        _setCoreSpot(500e6);
        vm.prank(bob);
        vault.depositCore(bob, 0);

        _setCoreSpot(10_500e6);
        vm.prank(alice);
        vault.depositCore(alice, 0);

        uint256 creatorAssets = vault.convertToAssets(vault.balanceOf(creator));
        assertApproxEqAbs(creatorAssets, 100e6, 1e3);
    }

    // ─── redeemCore ───────────────────────────────────────────────────────

    function test_redeem_creator_alone() public {
        _setCoreSpot(500e6);
        vm.prank(creator);
        vault.depositCore(creator, 0);

        uint256 sh = vault.balanceOf(creator);
        vm.prank(creator);
        uint256 amount = vault.redeemCore(sh, creator);

        assertApproxEqAbs(amount, 500e6, 1e3);
        assertEq(vault.totalSupply(), 0);
    }

    function test_redeem_insufficient_spot_reverts() public {
        _setCoreSpot(100e6);
        vm.prank(creator);
        vault.depositCore(creator, 0);

        // Pretend creator moved most of it to perp — only 5 on spot.
        _setCoreSpot(5e6);
        _setCorePerp(95e6);

        uint256 sh = vault.balanceOf(creator);
        vm.prank(creator);
        vm.expectRevert();
        vault.redeemCore(sh, creator);
    }

    function test_redeem_zero_shares_reverts() public {
        vm.prank(creator);
        vm.expectRevert(CreatorVault.ZeroAmount.selector);
        vault.redeemCore(0, creator);
    }

    function test_redeem_zero_address_reverts() public {
        vm.prank(creator);
        vm.expectRevert(CreatorVault.ZeroAddress.selector);
        vault.redeemCore(1, address(0));
    }

    // ─── Trading actions: access control ───────────────────────────────────

    function test_only_creator_can_move_on_core() public {
        vm.prank(alice);
        vm.expectRevert(CreatorVault.NotCreator.selector);
        vault.moveOnCore(100e6, true);
    }

    function test_only_creator_can_place_order() public {
        vm.prank(alice);
        vm.expectRevert(CreatorVault.NotCreator.selector);
        vault.placeOrder(0, true, 95_000_00000000, 100_000, false, HLConstants.TIF_IOC);
    }

    function test_only_admin_can_set_builder_fee() public {
        vm.prank(creator);
        vm.expectRevert();
        vault.setBuilderFee(address(0xBEE), 50);
    }

    function test_only_admin_can_reconcile() public {
        vm.prank(creator);
        vm.expectRevert();
        vault.reconcile();
    }

    function test_admin_reconcile_resets_watermark() public {
        _setCoreSpot(100e6);
        vm.prank(creator);
        vault.depositCore(creator, 0);
        assertEq(vault.lastSeenCoreSpot(), 100e6);

        _setCoreSpot(60e6);
        vm.prank(admin);
        vault.reconcile();
        assertEq(vault.lastSeenCoreSpot(), 60e6);
    }

    function test_move_on_core_to_perp_updates_watermark() public {
        _setCoreSpot(100e6);
        vm.prank(creator);
        vault.depositCore(creator, 0);

        vm.prank(creator);
        vault.moveOnCore(40e6, true);

        assertEq(vault.lastSeenCoreSpot(), 60e6);
    }

    function test_move_on_core_from_perp_updates_watermark() public {
        _setCoreSpot(100e6);
        vm.prank(creator);
        vault.depositCore(creator, 0);

        vm.prank(creator);
        vault.moveOnCore(40e6, false);

        assertEq(vault.lastSeenCoreSpot(), 140e6);
    }

    function test_place_order_succeeds_for_creator() public {
        vm.prank(creator);
        vault.placeOrder(0, true, 95_000_00000000, 100_000, false, HLConstants.TIF_IOC);
    }

    function test_set_builder_fee_succeeds_for_admin() public {
        vm.prank(admin);
        vault.setBuilderFee(address(0xBEE), 50);
    }
}
