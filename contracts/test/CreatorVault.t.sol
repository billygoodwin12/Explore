// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {CreatorVault} from "../src/CreatorVault.sol";
import {HLConstants} from "../src/HLConstants.sol";

/// @dev 6-dec USDC stand-in. Test accounts mint + approve the vault.
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @dev Mock of Circle's CoreDepositWallet. Real CDW does:
///        1. transferFrom(msg.sender, address(this), amount)
///        2. emit synthetic Transfer(this, USDC_SYSTEM_ADDRESS, amount)
///        3. if dex != 0xFFFFFFFF, call CoreWriter action 13
///      Tests don't care about (2)/(3) — they assert that USDC left the
///      vault. The test harness models Core settlement separately via
///      `_settleBridge`, which advances the mocked spot precompile.
contract MockCoreDepositWallet {
    using SafeERC20 for IERC20;

    address public immutable USDC;
    constructor(address usdc) { USDC = usdc; }

    function depositFor(address /*recipient*/, uint256 amount, uint32 /*destinationDex*/) external {
        IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount);
    }
}

contract CreatorVaultTest is Test {
    MockUSDC usdc;
    MockCoreDepositWallet cdw;
    CreatorVault vault;

    address admin = address(0xAD);
    address creator = address(0xC1);
    address treasury = address(0xFEE);
    address alice = address(0xA1);
    address bob = address(0xB0);

    uint256 internal coreSpot;
    uint256 internal corePerp;

    function setUp() public {
        usdc = new MockUSDC();
        cdw = new MockCoreDepositWallet(address(usdc));
        vault = new CreatorVault(
            IERC20(address(usdc)),
            creator,
            admin,
            address(cdw),
            "Theorise BTC Long",
            "tVAULT"
        );

        vm.mockCall(HLConstants.CORE_WRITER, bytes(""), bytes(""));

        // Pre-activate the vault with 1 USDC on Core, mirroring the
        // production runbook: admin sends 2 USDC → CDW deducts 1 USDC
        // newCoreAccountFee → 1 USDC settles on Core. Without this,
        // every deposit would revert with VaultNotActivated.
        _setCoreSpot(1e6);
        _setCorePerp(0);

        // Disable per-tx TVL cap by default so existing breach/redeem
        // scenarios remain readable. Dedicated tests cover the cap.
        uint16 capDisabled = vault.DEPOSIT_TVL_CAP_DISABLED();
        vm.prank(admin);
        vault.setDepositTvlCapBps(capDisabled);

        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob, 1_000_000e6);
        usdc.mint(creator, 10_000_000e6);
        vm.prank(alice);   usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);     usdc.approve(address(vault), type(uint256).max);
        vm.prank(creator); usdc.approve(address(vault), type(uint256).max);
    }

    // ─── Mock helpers ───────────────────────────────────────────

    function _setCoreSpot(uint256 sixDec) internal {
        coreSpot = sixDec;
        uint64 total8 = uint64(sixDec * 100);
        vm.mockCall(
            HLConstants.SPOT_BALANCE_PRECOMPILE,
            abi.encode(address(vault), HLConstants.USDC_SPOT_INDEX),
            abi.encode(total8, uint64(0), uint64(0))
        );
    }

    function _setCorePerp(uint256 sixDec) internal {
        corePerp = sixDec;
        int64 accountValue = int64(uint64(sixDec));
        vm.mockCall(
            HLConstants.ACCOUNT_MARGIN_SUMMARY_PRECOMPILE,
            abi.encode(uint32(0), address(vault)),
            abi.encode(accountValue, uint64(0), uint64(0), int64(0))
        );
    }

    /// @dev Simulate async bridge settlement. Tests modeling the sandwich
    ///      window do NOT call this between deposits.
    function _settleBridge(uint256 net) internal {
        _setCoreSpot(coreSpot + net);
    }

    // ─── Deploy invariants ────────────────────────────────────────

    function test_creator_stored() public view {
        assertEq(vault.CREATOR(), creator);
    }

    function test_admin_is_owner() public view {
        assertEq(vault.owner(), admin);
    }

    function test_asset_is_usdc() public view {
        assertEq(vault.asset(), address(usdc));
    }

    function test_core_deposit_wallet_stored() public view {
        assertEq(vault.CORE_DEPOSIT_WALLET(), address(cdw));
    }

    function test_share_decimals() public view {
        assertEq(vault.decimals(), 12);
    }

    function test_default_stake_cap_is_250k() public view {
        assertEq(vault.creatorStakeCapUsdc(), 250_000e6);
    }

    function test_min_creator_bps_is_500() public view {
        assertEq(vault.MIN_CREATOR_BPS(), 500);
    }

    function test_initial_breach_state_is_zero() public view {
        assertEq(vault.stakeBreachStartedAt(), 0);
        (bool inBreach,) = vault.isInBreach();
        assertFalse(inBreach);
    }

    function test_min_deposit_constant() public view {
        assertEq(vault.MIN_DEPOSIT_USDC(), 10e6);
    }

    function test_constructor_rejects_zero_cdw() public {
        vm.expectRevert(CreatorVault.ZeroAddress.selector);
        new CreatorVault(IERC20(address(usdc)), creator, admin, address(0), "x", "x");
    }

    // ─── ERC-4626 surface ──────────────────────────────────────────

    function test_max_withdraw_redeem_zero() public view {
        assertEq(vault.maxWithdraw(alice), 0);
        assertEq(vault.maxRedeem(alice), 0);
    }

    function test_withdraw_reverts() public {
        vm.expectRevert(CreatorVault.UseCoreRedeem.selector);
        vault.withdraw(1, alice, alice);
    }

    function test_redeem_evm_reverts() public {
        vm.expectRevert(CreatorVault.UseCoreRedeem.selector);
        vault.redeem(1, alice, alice);
    }

    function test_preview_withdraw_redeem_revert() public {
        vm.expectRevert(CreatorVault.UseCoreRedeem.selector);
        vault.previewWithdraw(1);
        vm.expectRevert(CreatorVault.UseCoreRedeem.selector);
        vault.previewRedeem(1);
    }

    // ─── deposit() happy paths ─────────────────────────────────────

    function test_first_deposit_mints_with_offset() public {
        // Pre-activation NAV = 1e6 (1 USDC, set in setUp). First $100 deposit
        // mints shares = mulDiv(100e6, 0 + 1e6, 1e6 + 1, Floor) = 99_999_900.
        vm.prank(creator);
        uint256 shares = vault.deposit(100e6, creator);

        assertGt(shares, 0);
        assertEq(vault.balanceOf(creator), shares);
        assertEq(usdc.balanceOf(address(vault)), 0, "vault holds no EVM USDC");
        assertEq(usdc.balanceOf(address(cdw)), 100e6, "bridged via CDW");

        _settleBridge(100e6);
        // Pre-activation 1e6 + this deposit 100e6 = 101e6.
        assertEq(vault.totalAssets(), 101e6);
    }

    function test_second_deposit_pro_rata() public {
        vm.prank(creator);
        vault.deposit(100e6, creator);
        _settleBridge(100e6);

        vm.prank(bob);
        uint256 bobShares = vault.deposit(50e6, bob);

        // After bootstrap (totalAssets ≈ 101e6, supply ≈ 99_999_900),
        // bob's 50e6 deposit mints ~5e7 shares (vs creator's ~1e8).
        // Bob's per-USDC rate ≈ creator's per-USDC rate (pro-rata).
        assertApproxEqAbs(bobShares, 5e7, 1e6);
        assertEq(vault.balanceOf(bob), bobShares);
    }

    function test_deposit_below_minimum_reverts() public {
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(CreatorVault.DepositBelowMinimum.selector, 5e6, 10e6)
        );
        vault.deposit(5e6, creator);
    }

    function test_deposit_zero_address_reverts() public {
        vm.prank(creator);
        vm.expectRevert(CreatorVault.ZeroAddress.selector);
        vault.deposit(100e6, address(0));
    }

    function test_deposit_emits_event() public {
        uint256 expectedShares = vault.previewDeposit(100e6);
        vm.prank(creator);
        vm.expectEmit(true, true, false, true, address(vault));
        emit CreatorVault.Deposited(creator, creator, 100e6, 0, expectedShares);
        vault.deposit(100e6, creator);
    }

    // ─── mint() ─────────────────────────────────────────────────────

    function test_mint_inverse_of_deposit() public {
        vm.prank(creator); vault.deposit(100e6, creator);
        _settleBridge(100e6);

        // Want ~half of creator's share count (~1e8) — picks a realistic
        // post-bootstrap target rather than relying on the empty-vault math.
        uint256 want = vault.balanceOf(creator) / 2;
        uint256 expected = vault.previewMint(want);

        vm.prank(bob);
        uint256 actual = vault.mint(want, bob);

        assertEq(actual, expected, "mint() returns gross assets");
        assertGe(vault.balanceOf(bob), want, "user gets at least requested shares");
    }

    function test_mint_with_fee_user_receives_at_least_requested_shares() public {
        uint16[5] memory feeBps = [uint16(0), 50, 100, 500, 1000];
        uint256[3] memory wants = [uint256(1e14), 1e16, 1e18];

        for (uint256 f = 0; f < feeBps.length; f++) {
            for (uint256 w = 0; w < wants.length; w++) {
                _resetVaultWithBootstrap();
                if (feeBps[f] > 0) {
                    vm.prank(admin);
                    vault.setDepositFee(feeBps[f], treasury);
                }

                uint256 want = wants[w];
                uint256 grossExpected = vault.previewMint(want);

                if (usdc.balanceOf(bob) < grossExpected) {
                    usdc.mint(bob, grossExpected);
                    vm.prank(bob);
                    usdc.approve(address(vault), type(uint256).max);
                }

                uint256 sharesBefore = vault.balanceOf(bob);
                vm.prank(bob);
                uint256 grossActual = vault.mint(want, bob);
                uint256 sharesGained = vault.balanceOf(bob) - sharesBefore;

                assertEq(grossActual, grossExpected, "mint returns previewMint");
                assertGe(
                    sharesGained,
                    want,
                    string.concat(
                        "shares < want at fee=",
                        vm.toString(uint256(feeBps[f])),
                        " want=",
                        vm.toString(want)
                    )
                );
            }
        }
    }

    function _resetVaultWithBootstrap() internal {
        usdc = new MockUSDC();
        cdw = new MockCoreDepositWallet(address(usdc));
        vault = new CreatorVault(
            IERC20(address(usdc)),
            creator,
            admin,
            address(cdw),
            "Theorise BTC Long",
            "tVAULT"
        );
        vm.mockCall(HLConstants.CORE_WRITER, bytes(""), bytes(""));
        // Pre-activate (1 USDC on Core, mirroring admin runbook).
        _setCoreSpot(1e6);
        _setCorePerp(0);

        uint16 capDisabled = vault.DEPOSIT_TVL_CAP_DISABLED();
        vm.prank(admin);
        vault.setDepositTvlCapBps(capDisabled);

        usdc.mint(creator, 10_000_000e6);
        usdc.mint(bob, 10_000_000e6);
        vm.prank(creator); usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);     usdc.approve(address(vault), type(uint256).max);

        vm.prank(creator);
        vault.deposit(100e6, creator);
        _settleBridge(100e6);
    }

    // ─── previewDeposit / previewMint ───────────────────────────────────

    function test_previewDeposit_no_fee() public view {
        // Pre-activation NAV=1e6, supply=0. Shares = floor(100e6 × 1e6 / (1e6+1)).
        assertEq(vault.previewDeposit(100e6), 99_999_900);
    }

    function test_previewDeposit_with_fee() public {
        vm.prank(admin); vault.setDepositFee(100, treasury);
        // Net 99e6 after 1% fee. Shares = floor(99e6 × 1e6 / (1e6+1)) = 98_999_901.
        assertEq(vault.previewDeposit(100e6), 98_999_901);
    }

    function test_previewMint_round_trip() public view {
        // For a vault at pre-activation NAV=1e6: ask previewMint for N shares,
        // then verify that depositing the returned gross gives back at least N.
        uint256 want = 50_000_000;
        uint256 gross = vault.previewMint(want);
        uint256 sharesIfDeposited = vault.previewDeposit(gross);
        assertGe(sharesIfDeposited, want, "round-trip lost shares");
    }

    function test_previewMint_with_fee_grosses_up() public {
        vm.prank(admin); vault.setDepositFee(100, treasury);

        vm.prank(creator);
        vault.deposit(100e6, creator);
        _settleBridge(99e6); // 1% fee skim; bridged 99e6

        // Use creator's actual shares as the target — robust to bootstrap rounding.
        uint256 want = vault.balanceOf(creator);
        uint256 gross = vault.previewMint(want);
        // gross should be ≈ 100e6 (what creator paid). Tolerance for pre-activation rounding.
        assertGe(gross, 99e6);
        assertLe(gross, 101e6);
    }

    // ─── Bridge accounting + sweep ──────────────────────────────────────

    function test_deposit_bridges_full_net_to_cdw() public {
        vm.prank(creator);
        vault.deposit(500e6, creator);

        assertEq(usdc.balanceOf(address(vault)), 0);
        assertEq(usdc.balanceOf(address(cdw)), 500e6);
        assertEq(usdc.balanceOf(HLConstants.USDC_SYSTEM_ADDRESS), 0);
    }

    function test_deposit_with_fee_skim_evm_side() public {
        vm.prank(admin); vault.setDepositFee(100, treasury);
        vm.prank(creator);
        vault.deposit(500e6, creator);

        assertEq(usdc.balanceOf(treasury), 5e6);
        assertEq(usdc.balanceOf(address(cdw)), 495e6);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_sweep_when_empty_is_noop() public {
        vault.sweepStrandedEvmUsdc();
        assertEq(usdc.balanceOf(address(cdw)), 0);
    }

    function test_sweep_bridges_donations_via_cdw() public {
        vm.prank(alice);
        usdc.transfer(address(vault), 25e6);
        assertEq(usdc.balanceOf(address(vault)), 25e6);

        vault.sweepStrandedEvmUsdc();

        assertEq(usdc.balanceOf(address(vault)), 0);
        assertEq(usdc.balanceOf(address(cdw)), 25e6);
    }

    function test_sweep_emits_event() public {
        vm.prank(alice);
        usdc.transfer(address(vault), 25e6);

        vm.expectEmit(false, false, false, true, address(vault));
        emit CreatorVault.StrandedUsdcSwept(25e6);
        vault.sweepStrandedEvmUsdc();
    }

    // ─── Per-tx TVL cap ───────────────────────────────────────────────

    function test_tvl_cap_default_is_5pct() public {
        cdw = new MockCoreDepositWallet(address(usdc));
        vault = new CreatorVault(
            IERC20(address(usdc)), creator, admin, address(cdw), "x", "y"
        );
        _setCoreSpot(0);
        _setCorePerp(0);
        assertEq(vault.depositTvlCapBps(), 500);
    }

    function test_deposit_reverts_when_vault_not_activated() public {
        cdw = new MockCoreDepositWallet(address(usdc));
        vault = new CreatorVault(
            IERC20(address(usdc)), creator, admin, address(cdw), "x", "y"
        );
        _setCoreSpot(0); // fresh vault, admin has NOT pre-activated
        _setCorePerp(0);

        vm.prank(creator); usdc.approve(address(vault), type(uint256).max);
        vm.prank(creator);
        vm.expectRevert(CreatorVault.VaultNotActivated.selector);
        vault.deposit(100e6, creator);
    }

    function test_max_deposit_zero_when_not_activated() public {
        cdw = new MockCoreDepositWallet(address(usdc));
        vault = new CreatorVault(
            IERC20(address(usdc)), creator, admin, address(cdw), "x", "y"
        );
        _setCoreSpot(0);
        _setCorePerp(0);
        assertEq(vault.maxDeposit(alice), 0);
        assertEq(vault.maxMint(alice), 0);
    }

    function test_tvl_cap_blocks_oversized_deposit() public {
        cdw = new MockCoreDepositWallet(address(usdc));
        vault = new CreatorVault(
            IERC20(address(usdc)), creator, admin, address(cdw), "x", "y"
        );
        _setCoreSpot(1000e6); // NAV = $1000; cap = 5% = $50
        _setCorePerp(0);

        vm.prank(bob); usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(CreatorVault.DepositExceedsTvlCap.selector, 51e6, 50e6)
        );
        vault.deposit(51e6, bob);
    }

    function test_tvl_cap_allows_at_or_below_cap() public {
        cdw = new MockCoreDepositWallet(address(usdc));
        vault = new CreatorVault(
            IERC20(address(usdc)), creator, admin, address(cdw), "x", "y"
        );
        _setCoreSpot(1000e6);
        _setCorePerp(0);
        vm.prank(bob); usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        vault.deposit(50e6, bob); // exactly at cap
    }

    function test_tvl_cap_floor_is_min_deposit() public {
        // Small NAV: 5% would be below MIN_DEPOSIT_USDC. Floor ensures deposits
        // ≥ MIN_DEPOSIT_USDC are accepted regardless.
        cdw = new MockCoreDepositWallet(address(usdc));
        vault = new CreatorVault(
            IERC20(address(usdc)), creator, admin, address(cdw), "x", "y"
        );
        _setCoreSpot(1e6); // 1 USDC NAV
        _setCorePerp(0);
        // 5% of 1 USDC = 0.05 USDC; floor = MIN_DEPOSIT_USDC = 10 USDC.
        assertEq(vault.maxDeposit(alice), 10e6);

        vm.prank(creator); usdc.approve(address(vault), type(uint256).max);
        vm.prank(creator);
        vault.deposit(10e6, creator); // exactly at floor, should pass
    }

    function test_max_deposit_reflects_cap() public {
        cdw = new MockCoreDepositWallet(address(usdc));
        vault = new CreatorVault(
            IERC20(address(usdc)), creator, admin, address(cdw), "x", "y"
        );
        _setCoreSpot(1000e6);
        _setCorePerp(0);
        // NAV = $1000, cap = 5% = $50, above floor of $10. Reports $50.
        assertEq(vault.maxDeposit(alice), 50e6);
    }

    function test_admin_can_tighten_tvl_cap() public {
        vm.prank(admin);
        vault.setDepositTvlCapBps(200);
        assertEq(vault.depositTvlCapBps(), 200);
    }

    function test_admin_cannot_set_tvl_cap_below_min() public {
        vm.prank(admin);
        vm.expectRevert();
        vault.setDepositTvlCapBps(50);
    }

    function test_admin_cannot_set_tvl_cap_above_max() public {
        vm.prank(admin);
        vm.expectRevert();
        vault.setDepositTvlCapBps(10_001);
    }

    function test_non_admin_cannot_set_tvl_cap() public {
        vm.prank(creator);
        vm.expectRevert();
        vault.setDepositTvlCapBps(1000);
    }

    // ─── Async-window behaviour ──────────────────────────────────────────

    function test_async_two_deposits_same_block_diverge() public {
        vm.prank(creator); vault.deposit(1_000_000e6, creator);
        _settleBridge(1_000_000e6);

        uint256 supplyBefore = vault.totalSupply();
        uint256 navBefore = vault.totalAssets();

        vm.prank(alice);
        uint256 aliceShares = vault.deposit(100_000e6, alice);

        vm.prank(bob);
        uint256 bobShares = vault.deposit(1_000e6, bob);

        uint256 aliceRate = aliceShares / 100_000;
        uint256 bobRate   = bobShares   / 1_000;

        assertGt(bobRate, aliceRate, "bob did not get cheaper shares");
        assertGe(
            (bobRate - aliceRate) * 100 / aliceRate,
            5,
            "divergence under 5%"
        );

        _settleBridge(101_000e6);
        assertEq(vault.totalAssets(), navBefore + 101_000e6);
        assertEq(vault.totalSupply(), supplyBefore + aliceShares + bobShares);
    }

    function test_tvl_cap_bounds_sandwich_window() public {
        cdw = new MockCoreDepositWallet(address(usdc));
        vault = new CreatorVault(
            IERC20(address(usdc)), creator, admin, address(cdw), "x", "y"
        );
        // Pre-activate at $1M so the cap is non-binding on the bootstrap
        // deposit and we can immediately test the sandwich-window bounds.
        _setCoreSpot(1_000_000e6);
        _setCorePerp(0);
        usdc.mint(creator, 10_000_000e6);
        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob, 1_000_000e6);
        vm.prank(creator); usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);   usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);     usdc.approve(address(vault), type(uint256).max);

        // Bootstrap creator under the cap: 5% of $1M = $50K.
        vm.prank(creator); vault.deposit(50_000e6, creator);
        _settleBridge(50_000e6);

        vm.prank(alice);
        uint256 aliceShares = vault.deposit(50_000e6, alice);

        // Bob deposits same $50K *before* alice's bridge settles. Sandwich
        // window: bob prices against pre-bridge NAV but post-mint supply,
        // so he gets more shares per dollar than alice did.
        vm.prank(bob);
        uint256 bobShares = vault.deposit(50_000e6, bob);

        // Compare share counts directly — same $ in means bob with more
        // shares ⇒ cheaper share price (sandwich lift).
        assertGt(bobShares, aliceShares);
        uint256 liftPct = ((bobShares - aliceShares) * 100) / aliceShares;
        assertLe(liftPct, 6, "lift exceeded interim mitigation budget");
    }

    function test_sync_two_deposits_with_settlement_between() public {
        vm.prank(creator); vault.deposit(1_000_000e6, creator);
        _settleBridge(1_000_000e6);

        vm.prank(alice);
        uint256 aliceShares = vault.deposit(100_000e6, alice);
        _settleBridge(100_000e6);

        vm.prank(bob);
        uint256 bobShares = vault.deposit(1_000e6, bob);
        _settleBridge(1_000e6);

        uint256 aliceRate = aliceShares / 100_000;
        uint256 bobRate   = bobShares   / 1_000;
        assertApproxEqRel(aliceRate, bobRate, 1e15);
    }

    // ─── Deposit fee admin ────────────────────────────────────────────

    function test_fee_defaults_to_zero() public view {
        assertEq(vault.depositFeeBps(), 0);
        assertEq(vault.feeRecipient(), address(0));
    }

    function test_admin_can_set_fee() public {
        vm.prank(admin); vault.setDepositFee(50, treasury);
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

    function test_fee_config_rejects_bps_with_zero_recipient() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(CreatorVault.FeeConfigInvalid.selector, uint16(100), address(0))
        );
        vault.setDepositFee(100, address(0));
    }

    function test_fee_config_rejects_zero_bps_with_recipient() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(CreatorVault.FeeConfigInvalid.selector, uint16(0), treasury)
        );
        vault.setDepositFee(0, treasury);
    }

    function test_fee_config_allows_clearing_both_zero() public {
        vm.prank(admin); vault.setDepositFee(100, treasury);
        vm.prank(admin); vault.setDepositFee(0, address(0));
        assertEq(vault.depositFeeBps(), 0);
        assertEq(vault.feeRecipient(), address(0));
    }

    // ─── Stake invariant: breach state machine ─────────────────────────────

    function test_breach_starts_below_5pct() public {
        vm.prank(creator); vault.deposit(5_000e6, creator);
        _settleBridge(5_000e6);
        assertEq(vault.stakeBreachStartedAt(), 0);

        vm.prank(bob); vault.deposit(195_000e6, bob);
        _settleBridge(195_000e6);

        assertGt(vault.stakeBreachStartedAt(), 0);
    }

    function test_breach_starts_when_cap_binds_at_high_aum() public {
        vm.prank(creator); vault.deposit(250_000e6, creator);
        _settleBridge(250_000e6);

        usdc.mint(bob, 9_750_000e6);
        vm.prank(bob); vault.deposit(9_750_000e6, bob);
        _settleBridge(9_750_000e6);

        uint256 redemptionAmount = 50_000e6;
        uint256 sharesToRedeem =
            (redemptionAmount * (vault.totalSupply() + 1e6)) / (vault.totalAssets() + 1);

        vm.prank(creator);
        vault.redeemCore(sharesToRedeem, creator);

        assertGt(vault.stakeBreachStartedAt(), 0);
    }

    function test_creator_can_trade_during_first_48h_of_breach() public {
        vm.prank(creator); vault.deposit(5_000e6, creator);
        _settleBridge(5_000e6);
        vm.prank(bob); vault.deposit(195_000e6, bob);
        _settleBridge(195_000e6);

        vm.warp(block.timestamp + 24 hours);
        vm.prank(creator);
        vault.placeOrder(0, true, 1e10, 100, false, HLConstants.TIF_IOC);
    }

    function test_creator_trading_halts_after_cure_period() public {
        vm.prank(creator); vault.deposit(5_000e6, creator);
        _settleBridge(5_000e6);
        vm.prank(bob); vault.deposit(195_000e6, bob);
        _settleBridge(195_000e6);

        vm.warp(block.timestamp + 49 hours);
        vm.prank(creator);
        vm.expectRevert();
        vault.placeOrder(0, true, 1e10, 100, false, HLConstants.TIF_IOC);
    }

    function test_deposits_halt_after_cure_period_expires() public {
        vm.prank(creator); vault.deposit(5_000e6, creator);
        _settleBridge(5_000e6);
        vm.prank(bob); vault.deposit(195_000e6, bob);
        _settleBridge(195_000e6);

        vm.warp(block.timestamp + 49 hours);

        assertEq(vault.maxDeposit(alice), 0);
        assertEq(vault.maxMint(alice), 0);

        vm.prank(alice);
        vm.expectRevert();
        vault.deposit(100e6, alice);
    }

    function test_redemptions_continue_during_cure_period_and_after() public {
        vm.prank(creator); vault.deposit(5_000e6, creator);
        _settleBridge(5_000e6);
        vm.prank(bob); vault.deposit(195_000e6, bob);
        _settleBridge(195_000e6);

        vm.warp(block.timestamp + 49 hours);

        uint256 bobShares = vault.balanceOf(bob);
        vm.prank(bob);
        uint256 amount = vault.redeemCore(bobShares, bob);
        assertGt(amount, 0);
    }

    function test_creator_topup_cures_breach() public {
        vm.prank(creator); vault.deposit(5_000e6, creator);
        _settleBridge(5_000e6);
        vm.prank(bob); vault.deposit(195_000e6, bob);
        _settleBridge(195_000e6);

        assertGt(vault.stakeBreachStartedAt(), 0);

        vm.prank(creator); vault.deposit(200_000e6, creator);
        _settleBridge(200_000e6);

        assertEq(vault.stakeBreachStartedAt(), 0);
    }

    function test_breach_state_resets_when_supply_zero() public {
        vm.prank(creator); vault.deposit(5_000e6, creator);
        _settleBridge(5_000e6);
        vm.prank(bob); vault.deposit(195_000e6, bob);
        _settleBridge(195_000e6);

        uint256 bobShares = vault.balanceOf(bob);
        vm.prank(bob);
        uint256 bobAmt = vault.redeemCore(bobShares, bob);
        _setCoreSpot(coreSpot - bobAmt);

        uint256 creatorShares = vault.balanceOf(creator);
        vm.prank(creator);
        uint256 creatorAmt = vault.redeemCore(creatorShares, creator);
        _setCoreSpot(coreSpot - creatorAmt);

        assertEq(vault.totalSupply(), 0);
        assertEq(vault.stakeBreachStartedAt(), 0);
    }

    // ─── Stake cap admin ──────────────────────────────────────────────

    function test_admin_can_adjust_cap_within_bounds() public {
        vm.prank(admin); vault.setCreatorStakeCap(500_000e6);
        assertEq(vault.creatorStakeCapUsdc(), 500_000e6);
    }

    function test_admin_cannot_set_cap_below_min() public {
        vm.prank(admin); vm.expectRevert();
        vault.setCreatorStakeCap(50_000e6);
    }

    function test_admin_cannot_set_cap_above_max() public {
        vm.prank(admin); vm.expectRevert();
        vault.setCreatorStakeCap(50_000_000e6);
    }

    function test_non_admin_cannot_set_creator_stake_cap() public {
        vm.prank(creator); vm.expectRevert();
        vault.setCreatorStakeCap(500_000e6);
    }

    function test_required_stake_view_below_threshold() public {
        _setCoreSpot(1_000_000e6);
        assertEq(vault.requiredCreatorStake(), 50_000e6);
    }

    function test_required_stake_view_above_threshold() public {
        _setCoreSpot(10_000_000e6);
        assertEq(vault.requiredCreatorStake(), 250_000e6);
    }

    // ─── redeemCore ───────────────────────────────────────────────

    function test_redeem_creator_alone() public {
        vm.prank(creator); vault.deposit(500e6, creator);
        _settleBridge(500e6);

        uint256 sh = vault.balanceOf(creator);
        vm.prank(creator);
        uint256 amount = vault.redeemCore(sh, creator);

        assertApproxEqAbs(amount, 500e6, 1e3);
        assertEq(vault.totalSupply(), 0);
    }

    function test_redeem_perp_positions_open_reverts() public {
        // Shortfall in spot ($5) is covered by creator's open perp position
        // ($95) → structured error tells caller to close positions.
        vm.prank(creator); vault.deposit(100e6, creator);
        _settleBridge(100e6);

        _setCoreSpot(5e6);
        _setCorePerp(95e6);

        uint256 sh = vault.balanceOf(creator);
        // Approximate amount the redeem would compute against current NAV.
        uint256 expectedAmount = Math.mulDiv(
            sh, vault.totalAssets() + 1, vault.totalSupply() + 1e6
        );
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                CreatorVault.RedeemPerpPositionsOpen.selector,
                uint256(5e6),
                expectedAmount,
                uint256(95e6)
            )
        );
        vault.redeemCore(sh, creator);
    }

    // `RedeemInsufficient` is structurally unreachable in PR 2-NEW
    // because amount ≤ totalAssets() always (share-math invariant). The
    // error path becomes reachable in PR 3-NEW when `pendingBridgedUsdc`
    // is included in totalAssets() but spot has not yet settled. Test
    // deferred to PR 3-NEW's test suite.

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

    // ─── Trading actions: access control ─────────────────────────────────

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

    function test_place_order_succeeds_for_creator() public {
        vm.prank(creator);
        vault.placeOrder(0, true, 95_000_00000000, 100_000, false, HLConstants.TIF_IOC);
    }

    function test_set_builder_fee_succeeds_for_admin() public {
        vm.prank(admin);
        vault.setBuilderFee(address(0xBEE), 50);
    }

    function test_move_on_core_succeeds_for_creator() public {
        vm.prank(creator); vault.deposit(100e6, creator);
        _settleBridge(100e6);

        vm.prank(creator);
        vault.moveOnCore(40e6, true);
    }

    // ─── Hardening: SafeCast ────────────────────────────────────────

    function test_moveOnCore_reverts_on_uint64_overflow() public {
        // amount > type(uint64).max should revert at the safe cast boundary.
        uint256 oversized = uint256(type(uint64).max) + 1;
        vm.prank(creator);
        vm.expectRevert(); // SafeCastOverflowedUintDowncast(64, oversized)
        vault.moveOnCore(oversized, true);
    }

    // ─── Hardening: Reentrancy guard ────────────────────────────────

    function test_reentrancy_guard_blocks_recursive_deposit() public {
        // Deploy a malicious CDW that re-enters vault.deposit() during its
        // depositFor() call. With nonReentrant in place, the recursive call
        // must revert with ReentrancyGuardReentrantCall.
        ReentrantCdw maliciousCdw = new ReentrantCdw(address(usdc));
        CreatorVault rentVault = new CreatorVault(
            IERC20(address(usdc)), creator, admin, address(maliciousCdw), "x", "y"
        );
        maliciousCdw.setVault(rentVault);

        // Mock the spot precompile for the new vault (pre-activated).
        vm.mockCall(
            HLConstants.SPOT_BALANCE_PRECOMPILE,
            abi.encode(address(rentVault), HLConstants.USDC_SPOT_INDEX),
            abi.encode(uint64(1e6 * 100), uint64(0), uint64(0))
        );
        vm.mockCall(
            HLConstants.ACCOUNT_MARGIN_SUMMARY_PRECOMPILE,
            abi.encode(uint32(0), address(rentVault)),
            abi.encode(int64(0), uint64(0), uint64(0), int64(0))
        );

        // Disable TVL cap so we don't trip on that first.
        uint16 capDisabled = rentVault.DEPOSIT_TVL_CAP_DISABLED();
        vm.prank(admin);
        rentVault.setDepositTvlCapBps(capDisabled);

        usdc.mint(creator, 1000e6);
        vm.prank(creator); usdc.approve(address(rentVault), type(uint256).max);
        vm.prank(creator);
        vm.expectRevert(); // ReentrancyGuardReentrantCall propagates up
        rentVault.deposit(100e6, creator);
    }
}

/// @dev Malicious CoreDepositWallet stub. During `depositFor`, attempts to
///      re-enter vault.deposit(). With nonReentrant in place, the recursive
///      call reverts and the outer call propagates the revert.
contract ReentrantCdw {
    using SafeERC20 for IERC20;
    address public immutable USDC;
    CreatorVault public vault;
    bool internal reentered;

    constructor(address usdc) { USDC = usdc; }
    function setVault(CreatorVault v) external { vault = v; }

    function depositFor(address /*recipient*/, uint256 amount, uint32 /*destinationDex*/) external {
        IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount);
        if (!reentered) {
            reentered = true;
            // Attempt re-entry. Should revert with ReentrancyGuardReentrantCall.
            vault.deposit(10e6, address(this));
        }
    }
}
