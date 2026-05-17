// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
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

        // Constructor default is DEPOSIT_TVL_CAP_DISABLED; dedicated
        // tests cover the cap.

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

    /// @dev Trigger the vault's `_settlePending()` without changing user
    ///      state. Uses `placeOrder` as a benign side-effect (CoreWriter
    ///      is mocked to no-op). Equivalent to "the next on-chain action
    ///      observes the settled state." Use after `_settleBridge` when
    ///      a test wants `totalAssets()` to reflect the post-drain value.
    function _poke() internal {
        vm.prank(creator);
        vault.placeOrder(0, true, 1, 1, false, HLConstants.TIF_IOC);
    }

    // PR 4 timelock helpers: propose + warp + execute as a single call,
    // so existing tests that previously called the immediate setters
    // stay readable. Revert-path tests target the propose function
    // directly (no helper, no warp).

    function _adminSetDepositFee(uint16 bps, address recip) internal {
        vm.prank(admin); vault.proposeDepositFeeChange(bps, recip);
        vm.warp(block.timestamp + vault.FEE_CHANGE_DELAY());
        vm.prank(admin); vault.executeDepositFeeChange();
    }

    function _adminSetCreatorStakeCap(uint256 newCap) internal {
        vm.prank(admin); vault.proposeStakeCapChange(newCap);
        vm.warp(block.timestamp + vault.STAKE_CAP_CHANGE_DELAY());
        vm.prank(admin); vault.executeStakeCapChange();
    }

    function _adminSetDepositTvlCapBps(uint16 newBps) internal {
        vm.prank(admin); vault.proposeTvlCapChange(newBps);
        vm.warp(block.timestamp + vault.TVL_CAP_CHANGE_DELAY());
        vm.prank(admin); vault.executeTvlCapChange();
    }

    function _adminSetBuilderFee(address builder, uint64 maxFeeRate) internal {
        vm.prank(admin); vault.proposeBuilderFeeChange(builder, maxFeeRate);
        vm.warp(block.timestamp + vault.BUILDER_FEE_CHANGE_DELAY());
        vm.prank(admin); vault.executeBuilderFeeChange();
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

        // Right after deposit: pendingBridgedUsdc = 100e6 (entry queued by
        // _enqueuePending). totalAssets = preActivation + pending = 101e6.
        assertEq(vault.totalAssets(), 101e6);
        assertEq(vault.pendingBridgedUsdc(), 100e6);

        // Simulate bridge landing on Core. Without a subsequent state-
        // mutating call, totalAssets temporarily double-counts (Core spot
        // grew to 101e6 AND pending still holds 100e6 = 201e6).
        _settleBridge(100e6);
        assertEq(vault.totalAssets(), 201e6);

        // The next state-mutating call invokes _settlePending and drains
        // the now-settled pending entry. totalAssets converges to 101e6.
        _poke();
        assertEq(vault.totalAssets(), 101e6);
        assertEq(vault.pendingBridgedUsdc(), 0);
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
                    _adminSetDepositFee(feeBps[f], treasury);
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
        _adminSetDepositFee(100, treasury);
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
        _adminSetDepositFee(100, treasury);

        vm.prank(creator);
        vault.deposit(100e6, creator);
        _settleBridge(99e6); // 1% fee skim; bridged 99e6
        _poke();              // drain the now-settled pending entry

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
        _adminSetDepositFee(100, treasury);
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

    function test_tvl_cap_default_is_disabled() public {
        // PR 3-NEW: default is DEPOSIT_TVL_CAP_DISABLED. The in-flight
        // tracker closes the sandwich window that the cap was originally
        // sized for. Admin retains the ability to re-enable as defense-in-
        // depth (per-vault basis).
        cdw = new MockCoreDepositWallet(address(usdc));
        vault = new CreatorVault(
            IERC20(address(usdc)), creator, admin, address(cdw), "x", "y"
        );
        _setCoreSpot(0);
        _setCorePerp(0);
        assertEq(vault.depositTvlCapBps(), vault.DEPOSIT_TVL_CAP_DISABLED());
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
        // Cap is disabled by default in PR 3-NEW. Admin opts in to 5%.
        cdw = new MockCoreDepositWallet(address(usdc));
        vault = new CreatorVault(
            IERC20(address(usdc)), creator, admin, address(cdw), "x", "y"
        );
        _adminSetDepositTvlCapBps(500);

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
        _adminSetDepositTvlCapBps(500);

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
        _adminSetDepositTvlCapBps(500);

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
        _adminSetDepositTvlCapBps(500);

        _setCoreSpot(1000e6);
        _setCorePerp(0);
        // NAV = $1000, cap = 5% = $50, above floor of $10. Reports $50.
        assertEq(vault.maxDeposit(alice), 50e6);
    }

    function test_admin_can_tighten_tvl_cap() public {
        _adminSetDepositTvlCapBps(200);
        assertEq(vault.depositTvlCapBps(), 200);
    }

    function test_admin_cannot_set_tvl_cap_below_min() public {
        vm.prank(admin);
        vm.expectRevert();
        vault.proposeTvlCapChange(50);
    }

    function test_admin_cannot_set_tvl_cap_above_max() public {
        vm.prank(admin);
        vm.expectRevert();
        vault.proposeTvlCapChange(10_001);
    }

    function test_non_admin_cannot_set_tvl_cap() public {
        vm.prank(creator);
        vm.expectRevert();
        vault.proposeTvlCapChange(1000);
    }

    // ─── Async-window behaviour ──────────────────────────────────────────

    /// @notice PR 3-NEW: the in-flight tracker closes the sandwich window
    ///         that PR 2-NEW's interim cap merely bounded. This test
    ///         repurposes the prior divergence demonstration: alice and bob
    ///         deposit in the same block (before alice's bridge settles).
    ///         With pendingBridgedUsdc in totalAssets(), bob's deposit
    ///         prices against the post-bridge NAV — same rate as alice.
    function test_async_two_deposits_same_block_closed_by_tracker() public {
        vm.prank(creator); vault.deposit(1_000_000e6, creator);
        _settleBridge(1_000_000e6);
        _poke(); // settle creator's pending so we start from a clean state

        vm.prank(alice);
        uint256 aliceShares = vault.deposit(100_000e6, alice);

        // No _settleBridge between alice and bob — alice's bridge is still
        // in-flight from the precompile's perspective. With the tracker,
        // pendingBridgedUsdc captures her in-flight 100K; bob sees the
        // correct post-deposit NAV.
        vm.prank(bob);
        uint256 bobShares = vault.deposit(1_000e6, bob);

        uint256 aliceRate = aliceShares / 100_000;
        uint256 bobRate   = bobShares   / 1_000;

        // Rates match (within 1 wei of integer-division rounding). Sandwich
        // window closed.
        assertApproxEqAbs(bobRate, aliceRate, 1, "rates diverge under tracker");
    }

    /// @notice With the in-flight tracker, the per-tx TVL cap is no longer
    ///         load-bearing for the sandwich window — bob and alice get the
    ///         same per-USDC share rate even when both deposits land before
    ///         alice's bridge settles. The cap remains as defense-in-depth
    ///         and admin-controlled risk lever, but does not bound any
    ///         active exploit.
    function test_sandwich_window_eliminated_by_tracker_under_cap() public {
        cdw = new MockCoreDepositWallet(address(usdc));
        vault = new CreatorVault(
            IERC20(address(usdc)), creator, admin, address(cdw), "x", "y"
        );
        // Cap defaults to disabled in PR 3-NEW. Admin opts back in to the
        // 5% cap so this test still verifies "no divergence under cap."
        _adminSetDepositTvlCapBps(500);

        _setCoreSpot(1_000_000e6);
        _setCorePerp(0);
        usdc.mint(creator, 10_000_000e6);
        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob, 1_000_000e6);
        vm.prank(creator); usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);   usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);     usdc.approve(address(vault), type(uint256).max);

        // Bootstrap creator at 5% of $1M = $50K.
        vm.prank(creator); vault.deposit(50_000e6, creator);
        _settleBridge(50_000e6);

        vm.prank(alice);
        uint256 aliceShares = vault.deposit(50_000e6, alice);

        // Bob deposits the same $50K BEFORE alice's bridge settles. Without
        // the tracker, bob would have priced against pre-bridge NAV and
        // gotten more shares per dollar. With the tracker, alice's pending
        // is included in totalAssets(), so bob's rate matches.
        vm.prank(bob);
        uint256 bobShares = vault.deposit(50_000e6, bob);

        // Same dollars in, same shares out (within 1 wei rounding).
        assertApproxEqAbs(bobShares, aliceShares, 1, "tracker did not close window");
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
        _adminSetDepositFee(50, treasury);
        assertEq(vault.depositFeeBps(), 50);
        assertEq(vault.feeRecipient(), treasury);
    }

    function test_non_admin_cannot_set_fee() public {
        vm.prank(creator);
        vm.expectRevert();
        vault.proposeDepositFeeChange(50, treasury);
    }

    function test_fee_cap_enforced() public {
        vm.prank(admin);
        vm.expectRevert();
        vault.proposeDepositFeeChange(1001, treasury);
    }

    function test_fee_config_rejects_bps_with_zero_recipient() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(CreatorVault.FeeConfigInvalid.selector, uint16(100), address(0))
        );
        vault.proposeDepositFeeChange(100, address(0));
    }

    function test_fee_config_rejects_zero_bps_with_recipient() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(CreatorVault.FeeConfigInvalid.selector, uint16(0), treasury)
        );
        vault.proposeDepositFeeChange(0, treasury);
    }

    function test_fee_config_allows_clearing_both_zero() public {
        _adminSetDepositFee(100, treasury);
        _adminSetDepositFee(0, address(0));
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
        _adminSetCreatorStakeCap(500_000e6);
        assertEq(vault.creatorStakeCapUsdc(), 500_000e6);
    }

    function test_admin_cannot_set_cap_below_min() public {
        vm.prank(admin); vm.expectRevert();
        vault.proposeStakeCapChange(50_000e6);
    }

    function test_admin_cannot_set_cap_above_max() public {
        vm.prank(admin); vm.expectRevert();
        vault.proposeStakeCapChange(50_000_000e6);
    }

    function test_non_admin_cannot_set_creator_stake_cap() public {
        vm.prank(creator); vm.expectRevert();
        vault.proposeStakeCapChange(500_000e6);
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
        _poke(); // drain pending so the shortfall cascade isn't masked

        _setCoreSpot(5e6);
        _setCorePerp(95e6);

        uint256 sh = vault.balanceOf(creator);
        // Approximate amount the redeem would compute against current NAV.
        // After _poke drains pending, totalAssets = spot + perp = 5 + 95 = 100.
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

    function test_redeem_dust_shares_reverts_with_amount_zero() public {
        // Creator deposits, bridge settles, pending drains via _poke.
        vm.prank(creator); vault.deposit(100e6, creator);
        _settleBridge(100e6);
        _poke();
        // Force Core spot to a tiny value; NAV becomes negligible relative
        // to supply, so a 1-share redeem rounds to amount=0.
        _setCoreSpot(1);
        _setCorePerp(0);

        vm.prank(creator);
        vm.expectRevert(CreatorVault.RedeemAmountZero.selector);
        vault.redeemCore(1, creator);
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
        vault.proposeBuilderFeeChange(address(0xBEE), 50);
    }

    function test_place_order_succeeds_for_creator() public {
        vm.prank(creator);
        vault.placeOrder(0, true, 95_000_00000000, 100_000, false, HLConstants.TIF_IOC);
    }

    function test_set_builder_fee_succeeds_for_admin() public {
        _adminSetBuilderFee(address(0xBEE), 50);
    }

    function test_move_on_core_succeeds_for_creator() public {
        vm.prank(creator); vault.deposit(100e6, creator);
        _settleBridge(100e6);

        vm.prank(creator);
        vault.moveOnCore(40e6, true);
    }

    // ─── PR 3-NEW: tracker wired into mutators ────────────────────────

    /// @notice Transient false-positive breach state (KNOWN_ISSUES §2) is
    ///         eliminated by the tracker. Setup: creator deposits a small
    ///         amount, then a large follower deposit lands. Pre-tracker,
    ///         the breach check inside the follower's deposit ran against
    ///         stale totalAssets (Core not yet credited) but post-mint
    ///         supply, firing a transient StakeBreachStarted that would
    ///         self-heal on the next state-mutating call. With the tracker,
    ///         totalAssets() includes the follower's pending bridge during
    ///         their own deposit's breach check; no transient event fires.
    function test_no_transient_breach_event_during_deposit_settlement() public {
        // Creator deposits $300K — clearly above the $250K cap so post-
        // dilution they have comfortable margin (no 1-wei floor-rounding
        // edge against the cap). Pre-tracker, a $9.7M follower deposit
        // would leave totalAssets stale at $300K (Core only), so creator's
        // apparent stake = creator_shares × $300K / new_supply ≈ $9K,
        // versus required = min(5% × $300K = $15K, $250K cap) = $15K.
        // Creator at $9K < required $15K → transient breach fires.
        // With tracker, totalAssets includes Bob's pending $9.7M → creator
        // stake reads ~$300K, required = $250K cap binds, $300K > $250K
        // with comfortable margin → no breach.
        vm.prank(creator); vault.deposit(300_000e6, creator);
        _settleBridge(300_000e6);
        _poke();

        usdc.mint(bob, 9_700_000e6);
        vm.prank(bob); usdc.approve(address(vault), type(uint256).max);

        vm.recordLogs();
        vm.prank(bob); vault.deposit(9_700_000e6, bob);

        bytes32 breachTopic = keccak256("StakeBreachStarted(uint256,uint256,uint256)");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            assertFalse(
                logs[i].topics.length > 0 && logs[i].topics[0] == breachTopic,
                "transient StakeBreachStarted fired despite tracker"
            );
        }
        assertEq(vault.stakeBreachStartedAt(), 0);
    }

    /// @notice Redemption during the pending-settlement window fires the
    ///         structured RedeemPendingSettlement error so the UI can
    ///         suggest a retry-after-N-blocks wait to the user.
    function test_redeem_pending_settlement_fires_during_window() public {
        // Set up a scenario where Core spot is low relative to pending:
        // both creator and bob deposit, neither bridge has settled. Core
        // spot stays at the pre-activation 1 USDC; pending holds both
        // deposits. Creator's redeem amount (a fraction of inflated NAV)
        // exceeds current spot, but the shortfall is covered by pending.
        vm.prank(creator); vault.deposit(100e6, creator);
        // NO _settleBridge / _poke between deposits — both stay pending.
        vm.prank(bob); vault.deposit(200e6, bob);

        // At this point: coreSpot=1e6 (mock, never settled), pending=300e6,
        // totalAssets=301e6. Creator's shares (~99_999_900) redeem to ~100e6,
        // far above current spot=1e6 but within spot + pending.
        uint256 sh = vault.balanceOf(creator);
        vm.prank(creator);
        try vault.redeemCore(sh, creator) {
            revert("expected RedeemPendingSettlement");
        } catch (bytes memory data) {
            bytes4 selector = bytes4(data);
            assertEq(
                selector,
                CreatorVault.RedeemPendingSettlement.selector,
                "wrong error selector"
            );
        }
    }

    /// @notice moveOnCore(toPerp=false) credits Core spot but the tracker
    ///         should NOT drain pending — the inflow is accounted for via
    ///         inFlightFromPerp, consumed first in _settlePending.
    function test_moveOnCore_to_spot_does_not_drain_pending() public {
        // Bootstrap. Creator deposits, bridge settles, pending drained.
        vm.prank(creator); vault.deposit(100e6, creator);
        _settleBridge(100e6);
        _poke();
        assertEq(vault.pendingBridgedUsdc(), 0);

        // Move 40e6 perp→spot via moveOnCore(toPerp=false). This bumps
        // inFlightFromPerp; Core spot will grow async.
        vm.prank(creator); vault.moveOnCore(40e6, false);

        // Bob deposits 50e6 — adds 50e6 to pending.
        vm.prank(bob); vault.deposit(50e6, bob);
        assertEq(vault.pendingBridgedUsdc(), 50e6);

        // Core grows by 40e6 (the perp→spot move settled). Trigger settle.
        // The tracker should reserve 40e6 against inFlightFromPerp, leaving
        // bob's 50e6 in pending untouched.
        _settleBridge(40e6);
        _poke();
        assertEq(vault.pendingBridgedUsdc(), 50e6, "perp inflow incorrectly drained pending");
    }

    /// @notice Multi-deposit sequencing: alice, bob, settle, redeem. Verify
    ///         pending accounting + share math stays consistent.
    function test_multi_deposit_settle_redeem_consistency() public {
        // Bootstrap creator.
        vm.prank(creator); vault.deposit(100_000e6, creator);
        _settleBridge(100_000e6);
        _poke();

        uint256 creatorShares = vault.balanceOf(creator);

        // Alice deposits 10K, bob deposits 20K — both before either settles.
        vm.prank(alice); uint256 aliceShares = vault.deposit(10_000e6, alice);
        vm.prank(bob);   uint256 bobShares   = vault.deposit(20_000e6, bob);

        assertEq(vault.pendingBridgedUsdc(), 30_000e6);

        // Both bridges land on Core.
        _settleBridge(30_000e6);
        _poke();
        assertEq(vault.pendingBridgedUsdc(), 0, "pending not drained after both settle");

        // Verify totalAssets converges: pre-activation 1e6 + 100K + 30K = 130_001e6.
        assertEq(vault.totalAssets(), 130_001e6);

        // Alice redeems all her shares. Should succeed (spot has enough).
        vm.prank(alice);
        uint256 aliceOut = vault.redeemCore(aliceShares, alice);
        // Alice deposited 10K; should withdraw approximately the same.
        assertApproxEqAbs(aliceOut, 10_000e6, 50e6);

        // Bob redeems all his shares. Should also succeed.
        // Simulate alice's redeem outflow on the mock first.
        _setCoreSpot(coreSpot - aliceOut);
        vm.prank(bob);
        uint256 bobOut = vault.redeemCore(bobShares, bob);
        assertApproxEqAbs(bobOut, 20_000e6, 50e6);

        // Creator still holds their full balance.
        assertEq(vault.balanceOf(creator), creatorShares);
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

        // Constructor default is DEPOSIT_TVL_CAP_DISABLED.

        usdc.mint(creator, 1000e6);
        vm.prank(creator); usdc.approve(address(rentVault), type(uint256).max);
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
        );
        rentVault.deposit(100e6, creator);
    }

    // ─── PR 4: time-locked admin operations ───────────────────────────

    function test_delay_constants_have_expected_values() public view {
        assertEq(vault.FEE_CHANGE_DELAY(),         24 hours);
        assertEq(vault.TVL_CAP_CHANGE_DELAY(),     24 hours);
        assertEq(vault.BUILDER_FEE_CHANGE_DELAY(), 24 hours);
        assertEq(vault.STAKE_CAP_CHANGE_DELAY(),   7 days);
    }

    function test_propose_fee_emits_and_sets_pending() public {
        vm.expectEmit(true, true, true, true, address(vault));
        emit CreatorVault.DepositFeeChangeProposed(
            100, treasury, uint64(block.timestamp + 24 hours)
        );
        vm.prank(admin);
        vault.proposeDepositFeeChange(100, treasury);

        (uint16 newBps, address newRecipient, uint64 executableAt) = vault.pendingFeeChange();
        assertEq(newBps, 100);
        assertEq(newRecipient, treasury);
        assertEq(executableAt, uint64(block.timestamp + 24 hours));
    }

    function test_propose_fee_reverts_if_pending_exists() public {
        vm.prank(admin); vault.proposeDepositFeeChange(50, treasury);
        (, , uint64 existing) = vault.pendingFeeChange();

        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(CreatorVault.PendingChangeExists.selector, existing)
        );
        vault.proposeDepositFeeChange(100, treasury);
    }

    function test_execute_fee_reverts_before_delay() public {
        vm.prank(admin); vault.proposeDepositFeeChange(50, treasury);
        uint64 ea = uint64(block.timestamp + 24 hours);

        vm.warp(block.timestamp + 24 hours - 1);
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                CreatorVault.TimelockNotElapsed.selector, ea, uint64(block.timestamp)
            )
        );
        vault.executeDepositFeeChange();
    }

    function test_execute_fee_reverts_when_no_pending() public {
        vm.prank(admin);
        vm.expectRevert(CreatorVault.NoPendingChange.selector);
        vault.executeDepositFeeChange();
    }

    function test_propose_execute_fee_happy_path() public {
        _adminSetDepositFee(75, treasury);
        assertEq(vault.depositFeeBps(), 75);
        assertEq(vault.feeRecipient(), treasury);
        (uint16 b, address r, uint64 ea) = vault.pendingFeeChange();
        assertEq(b, 0); assertEq(r, address(0)); assertEq(ea, 0);
    }

    function test_cancel_fee_clears_pending_and_emits() public {
        vm.prank(admin); vault.proposeDepositFeeChange(50, treasury);

        vm.expectEmit(true, true, true, true, address(vault));
        emit CreatorVault.DepositFeeChangeCancelled(50, treasury);
        vm.prank(admin); vault.cancelPendingFeeChange();

        (, , uint64 ea) = vault.pendingFeeChange();
        assertEq(ea, 0);
    }

    function test_cancel_fee_reverts_when_no_pending() public {
        vm.prank(admin);
        vm.expectRevert(CreatorVault.NoPendingChange.selector);
        vault.cancelPendingFeeChange();
    }

    function test_re_propose_after_cancel_works() public {
        vm.prank(admin); vault.proposeDepositFeeChange(50, treasury);
        vm.prank(admin); vault.cancelPendingFeeChange();
        vm.prank(admin); vault.proposeDepositFeeChange(100, treasury);

        (uint16 newBps, , ) = vault.pendingFeeChange();
        assertEq(newBps, 100);
    }

    function test_execute_stake_cap_reverts_before_7_days() public {
        vm.prank(admin); vault.proposeStakeCapChange(500_000e6);
        uint64 ea = uint64(block.timestamp + 7 days);

        vm.warp(block.timestamp + 7 days - 1);
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                CreatorVault.TimelockNotElapsed.selector, ea, uint64(block.timestamp)
            )
        );
        vault.executeStakeCapChange();
    }

    function test_propose_execute_stake_cap_happy_path() public {
        _adminSetCreatorStakeCap(500_000e6);
        assertEq(vault.creatorStakeCapUsdc(), 500_000e6);
    }

    function test_propose_stake_cap_reverts_if_pending_exists() public {
        vm.prank(admin); vault.proposeStakeCapChange(300_000e6);
        (, uint64 existing) = vault.pendingStakeCap();
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(CreatorVault.PendingChangeExists.selector, existing)
        );
        vault.proposeStakeCapChange(400_000e6);
    }

    function test_propose_execute_tvl_cap_happy_path() public {
        _adminSetDepositTvlCapBps(250);
        assertEq(vault.depositTvlCapBps(), 250);
    }

    function test_propose_tvl_cap_disabled_sentinel_allowed() public {
        // First tighten to a real value, then propose the DISABLED
        // sentinel to confirm the sentinel passes the bounds check.
        _adminSetDepositTvlCapBps(500);
        _adminSetDepositTvlCapBps(vault.DEPOSIT_TVL_CAP_DISABLED());
        assertEq(vault.depositTvlCapBps(), vault.DEPOSIT_TVL_CAP_DISABLED());
    }

    function test_propose_execute_builder_fee_fires_action() public {
        // executeBuilderFeeChange must emit BuilderApproved (legacy event)
        // alongside BuilderFeeChangeExecuted (new event).
        vm.prank(admin); vault.proposeBuilderFeeChange(address(0xBEE), 50);
        vm.warp(block.timestamp + 24 hours);

        vm.expectEmit(true, true, true, true, address(vault));
        emit CreatorVault.BuilderApproved(address(0xBEE), 50);
        vm.expectEmit(true, true, true, true, address(vault));
        emit CreatorVault.BuilderFeeChangeExecuted(address(0xBEE), 50);

        vm.prank(admin); vault.executeBuilderFeeChange();
    }

    function test_non_admin_cannot_propose_any() public {
        vm.startPrank(creator);
        vm.expectRevert(); vault.proposeDepositFeeChange(50, treasury);
        vm.expectRevert(); vault.proposeStakeCapChange(500_000e6);
        vm.expectRevert(); vault.proposeTvlCapChange(500);
        vm.expectRevert(); vault.proposeBuilderFeeChange(address(0xBEE), 50);
        vm.stopPrank();
    }

    function test_non_admin_cannot_execute_any() public {
        vm.prank(admin); vault.proposeDepositFeeChange(50, treasury);
        vm.prank(admin); vault.proposeStakeCapChange(500_000e6);
        vm.prank(admin); vault.proposeTvlCapChange(500);
        vm.prank(admin); vault.proposeBuilderFeeChange(address(0xBEE), 50);
        vm.warp(block.timestamp + 7 days);

        vm.startPrank(creator);
        vm.expectRevert(); vault.executeDepositFeeChange();
        vm.expectRevert(); vault.executeStakeCapChange();
        vm.expectRevert(); vault.executeTvlCapChange();
        vm.expectRevert(); vault.executeBuilderFeeChange();
        vm.stopPrank();
    }

    function test_non_admin_cannot_cancel_any() public {
        vm.prank(admin); vault.proposeDepositFeeChange(50, treasury);
        vm.startPrank(creator);
        vm.expectRevert(); vault.cancelPendingFeeChange();
        vm.expectRevert(); vault.cancelPendingStakeCapChange();
        vm.expectRevert(); vault.cancelPendingTvlCapChange();
        vm.expectRevert(); vault.cancelPendingBuilderFeeChange();
        vm.stopPrank();
    }
}

/// @dev Test harness exposing the in-flight tracker internals for direct
///      testing. Used by `CreatorVaultTrackerTest` to exercise
///      `_settlePending`, `_enqueuePending`, and observe `pending` /
///      `pendingStart` / `inFlightFromPerp` state without going through
///      `_doDeposit` (which is wired in commit 3).
contract CreatorVaultHarness is CreatorVault {
    constructor(
        IERC20 usdc,
        address creator_,
        address admin_,
        address coreDepositWallet_,
        string memory name_,
        string memory symbol_
    ) CreatorVault(usdc, creator_, admin_, coreDepositWallet_, name_, symbol_) {}

    function exposed_settlePending() external {
        _settlePending();
    }

    function exposed_enqueuePending(uint256 amount) external {
        _enqueuePending(amount);
    }

    function exposed_pendingLength() external view returns (uint256) {
        return pending.length;
    }

    function exposed_pendingStart() external view returns (uint256) {
        return pendingStart;
    }

    function exposed_pendingAt(uint256 i) external view returns (uint128 amount, uint64 enqueueBlock) {
        PendingBridge memory e = pending[i];
        return (e.amount, e.enqueueBlock);
    }

    function exposed_inFlightFromPerp() external view returns (uint256) {
        return inFlightFromPerp;
    }

    function exposed_setInFlightFromPerp(uint256 v) external {
        inFlightFromPerp = v;
    }

    function exposed_lastCheckedCoreSpot() external view returns (uint256) {
        return lastCheckedCoreSpot;
    }
}

/// @dev Tracker-focused tests. Uses CreatorVaultHarness to inject pending
///      entries directly without going through `_doDeposit` wiring (which
///      arrives in commit 3).
contract CreatorVaultTrackerTest is Test {
    MockUSDC usdc;
    MockCoreDepositWallet cdw;
    CreatorVaultHarness vault;

    address admin = address(0xAD);
    address creator = address(0xC1);

    uint256 internal coreSpot;

    function setUp() public {
        usdc = new MockUSDC();
        cdw = new MockCoreDepositWallet(address(usdc));
        vault = new CreatorVaultHarness(
            IERC20(address(usdc)), creator, admin, address(cdw), "x", "y"
        );
        vm.mockCall(HLConstants.CORE_WRITER, bytes(""), bytes(""));
        _setCoreSpot(0);
        _setCorePerp(0);
    }

    function _setCoreSpot(uint256 sixDec) internal {
        coreSpot = sixDec;
        vm.mockCall(
            HLConstants.SPOT_BALANCE_PRECOMPILE,
            abi.encode(address(vault), HLConstants.USDC_SPOT_INDEX),
            abi.encode(uint64(sixDec * 100), uint64(0), uint64(0))
        );
    }

    function _setCorePerp(uint256 sixDec) internal {
        vm.mockCall(
            HLConstants.ACCOUNT_MARGIN_SUMMARY_PRECOMPILE,
            abi.encode(uint32(0), address(vault)),
            abi.encode(int64(uint64(sixDec)), uint64(0), uint64(0), int64(0))
        );
    }

    // ─── totalAssets includes pendingBridgedUsdc ─────────────────────

    function test_totalAssets_includes_pending() public {
        _setCoreSpot(100e6);
        _setCorePerp(50e6);
        assertEq(vault.totalAssets(), 150e6);

        vault.exposed_enqueuePending(25e6);
        assertEq(vault.pendingBridgedUsdc(), 25e6);
        assertEq(vault.totalAssets(), 175e6);
    }

    // ─── Observation-based settlement ────────────────────────────────

    function test_settle_drains_oldest_first() public {
        _setCoreSpot(1e6);
        vault.exposed_settlePending(); // initial checkpoint

        // Enqueue 3 deposits, total 60 USDC pending.
        vault.exposed_enqueuePending(10e6);
        vault.exposed_enqueuePending(20e6);
        vault.exposed_enqueuePending(30e6);
        assertEq(vault.pendingBridgedUsdc(), 60e6);
        assertEq(vault.exposed_pendingLength(), 3);
        assertEq(vault.exposed_pendingStart(), 0);

        // Core grows by 25 USDC (enough for entry 0 + part of entry 1).
        _setCoreSpot(1e6 + 25e6);
        vault.exposed_settlePending();

        // Entry 0 (10) fully settled; entry 1 partially (15 of 20).
        assertEq(vault.pendingBridgedUsdc(), 35e6);
        assertEq(vault.exposed_pendingStart(), 1);
        (uint128 amt1,) = vault.exposed_pendingAt(1);
        assertEq(amt1, 5e6); // 20 - 15 = 5 left in entry 1
    }

    function test_settle_handles_exact_drain() public {
        _setCoreSpot(1e6);
        vault.exposed_settlePending();

        vault.exposed_enqueuePending(40e6);
        vault.exposed_enqueuePending(20e6);

        // Growth exactly equals first entry → drain entry 0, leave entry 1.
        _setCoreSpot(1e6 + 40e6);
        vault.exposed_settlePending();

        assertEq(vault.pendingBridgedUsdc(), 20e6);
        assertEq(vault.exposed_pendingStart(), 1);
    }

    function test_settle_no_growth_no_drain() public {
        _setCoreSpot(1e6);
        vault.exposed_settlePending();

        vault.exposed_enqueuePending(10e6);
        // Core does NOT grow.
        vault.exposed_settlePending();
        assertEq(vault.pendingBridgedUsdc(), 10e6);
        assertEq(vault.exposed_pendingStart(), 0);
    }

    function test_settle_growth_exceeds_pending() public {
        _setCoreSpot(1e6);
        vault.exposed_settlePending();

        vault.exposed_enqueuePending(10e6);
        // Core grows by 100 (much more than the 10 pending).
        _setCoreSpot(1e6 + 100e6);
        vault.exposed_settlePending();

        // Pending fully drained; excess growth becomes part of new checkpoint.
        assertEq(vault.pendingBridgedUsdc(), 0);
        assertEq(vault.exposed_pendingStart(), 1);
        assertEq(vault.exposed_lastCheckedCoreSpot(), 1e6 + 100e6);
    }

    // ─── Time-based fallback ─────────────────────────────────────────

    function test_settle_expires_old_entries() public {
        _setCoreSpot(1e6);
        vault.exposed_settlePending();

        vault.exposed_enqueuePending(10e6);
        uint256 oldBlock = block.number;

        // Advance past the fallback window with NO Core growth.
        vm.roll(oldBlock + vault.SETTLEMENT_BLOCKS_FALLBACK() + 1);
        vault.exposed_settlePending();

        // Entry expired via time-based fallback.
        assertEq(vault.pendingBridgedUsdc(), 0);
        assertEq(vault.exposed_pendingStart(), 1);
    }

    function test_settle_keeps_recent_entries() public {
        _setCoreSpot(1e6);
        vault.exposed_settlePending();

        vault.exposed_enqueuePending(10e6);

        // Advance only halfway through the fallback window.
        vm.roll(block.number + vault.SETTLEMENT_BLOCKS_FALLBACK() / 2);
        vault.exposed_settlePending();

        // Entry still pending — within the window.
        assertEq(vault.pendingBridgedUsdc(), 10e6);
        assertEq(vault.exposed_pendingStart(), 0);
    }

    // ─── inFlightFromPerp consumption ────────────────────────────────

    function test_settle_reserves_perp_inflow_before_pending() public {
        _setCoreSpot(1e6);
        vault.exposed_settlePending();

        vault.exposed_enqueuePending(20e6);
        vault.exposed_setInFlightFromPerp(15e6);

        // Core grows by 30 — 15 reserved for perp inflow, 15 drains pending.
        _setCoreSpot(1e6 + 30e6);
        vault.exposed_settlePending();

        assertEq(vault.exposed_inFlightFromPerp(), 0); // fully reserved
        assertEq(vault.pendingBridgedUsdc(), 5e6);     // 20 - 15 left
    }

    function test_settle_perp_inflow_alone_does_not_drain() public {
        _setCoreSpot(1e6);
        vault.exposed_settlePending();

        vault.exposed_enqueuePending(10e6);
        vault.exposed_setInFlightFromPerp(50e6);

        // Core grows by 30 — all reserved for perp inflow.
        _setCoreSpot(1e6 + 30e6);
        vault.exposed_settlePending();

        assertEq(vault.exposed_inFlightFromPerp(), 20e6); // 50 - 30 = 20 still expected
        assertEq(vault.pendingBridgedUsdc(), 10e6);       // pending untouched
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
