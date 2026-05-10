// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CreatorVault} from "../src/CreatorVault.sol";
import {HLConstants} from "../src/HLConstants.sol";

/// @dev 6-dec USDC stand-in. We mint into test accounts and have them
///      approve the vault. The vault `transfer`s to USDC_SYSTEM_ADDRESS
///      to simulate the bridge; the helper `_settleBridge` advances the
///      mocked Core spot precompile to model an async settlement.
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract CreatorVaultTest is Test {
    MockUSDC usdc;
    CreatorVault vault;

    address admin = address(0xAD);
    address creator = address(0xC1);
    address treasury = address(0xFEE);
    address alice = address(0xA1);
    address bob = address(0xB0);

    /// @dev Mocked Core spot balance (in 6-dec). Mirrors what the
    ///      precompile would return after a bridge settles.
    uint256 internal coreSpot;
    /// @dev Mocked Core perp accountValue (6-dec).
    uint256 internal corePerp;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new CreatorVault(
            IERC20(address(usdc)),
            creator,
            admin,
            "Theorise BTC Long",
            "tVAULT"
        );

        vm.mockCall(HLConstants.CORE_WRITER, bytes(""), bytes(""));

        _setCoreSpot(0);
        _setCorePerp(0);

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

    /// @dev Simulate async bridge settlement by advancing the mocked Core
    ///      spot balance. Tests that need to model the sandwich window
    ///      do NOT call this between deposits.
    function _settleBridge(uint256 net) internal {
        _setCoreSpot(coreSpot + net);
    }

    /// @dev One-call helper for the common pattern: deposit, then settle.
    function _depositAndSettle(address from, uint256 assets) internal returns (uint256 shares) {
        uint256 evmBefore = usdc.balanceOf(address(vault));
        vm.prank(from);
        shares = vault.deposit(assets, from);
        uint256 evmAfter = usdc.balanceOf(address(vault));
        // Vault should hold no USDC after deposit (all bridged + fee'd out).
        assertEq(evmAfter, evmBefore, "vault retained EVM USDC");
        // Net = full bridged amount = assets - fee. We can recover it from
        // the system address's increase.
        uint256 sysBalance = usdc.balanceOf(HLConstants.USDC_SYSTEM_ADDRESS);
        // Settle the just-bridged amount: net = (sysBalance - prevSysBalance)
        // is awkward to track here; use deposit assets minus fee.
        (uint16 bps,) = (vault.depositFeeBps(), vault.feeRecipient());
        uint256 fee = bps == 0 ? 0 : (assets * bps) / 10_000;
        if (vault.feeRecipient() == address(0)) fee = 0;
        _settleBridge(assets - fee);
        sysBalance; // silence
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

    // ─── ERC-4626 surface: deposit/mint open, withdraw/redeem closed ────

    function test_max_deposit_open_when_no_breach() public view {
        assertEq(vault.maxDeposit(alice), type(uint256).max);
        assertEq(vault.maxMint(alice), type(uint256).max);
    }

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

    // ─── deposit() happy paths ────────────────────────────────────

    function test_first_deposit_mints_with_offset() public {
        vm.prank(creator);
        uint256 shares = vault.deposit(100e6, creator);

        assertEq(shares, 1e14, "shares == 100e6 * 1e6");
        assertEq(vault.balanceOf(creator), 1e14);
        assertEq(usdc.balanceOf(address(vault)), 0, "vault holds no EVM USDC");
        assertEq(usdc.balanceOf(HLConstants.USDC_SYSTEM_ADDRESS), 100e6, "bridged");

        _settleBridge(100e6);
        assertEq(vault.totalAssets(), 100e6);
    }

    function test_second_deposit_pro_rata() public {
        vm.prank(creator);
        vault.deposit(100e6, creator);
        _settleBridge(100e6);

        vm.prank(bob);
        uint256 bobShares = vault.deposit(50e6, bob);

        // 100e6 NAV, 1e14 supply. Bob deposits 50e6 net.
        // shares = 50e6 * (1e14 + 1e6) / (100e6 + 1)
        assertApproxEqAbs(bobShares, 5e13, 1e6);
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
        vm.prank(creator);
        vm.expectEmit(true, true, false, true, address(vault));
        emit CreatorVault.Deposited(creator, creator, 100e6, 0, 1e14);
        vault.deposit(100e6, creator);
    }

    // ─── mint() happy paths ────────────────────────────────────────

    function test_mint_inverse_of_deposit() public {
        // Bootstrap so totalSupply > 0.
        vm.prank(creator);
        vault.deposit(100e6, creator);
        _settleBridge(100e6);

        uint256 want = 5e13;
        uint256 expected = vault.previewMint(want);

        vm.prank(bob);
        uint256 actual = vault.mint(want, bob);

        assertEq(actual, expected, "mint() returns gross assets");
        assertGe(vault.balanceOf(bob), want, "user gets at least requested shares");
    }

    function test_mint_with_fee_user_receives_at_least_requested_shares() public {
        // Loop over fee bps × share counts as the protocol mandates.
        uint16[5] memory feeBps = [uint16(0), 50, 100, 500, 1000];
        // Wants chosen so previewMint(want) >= MIN_DEPOSIT_USDC after the
        // bootstrap of $100. 1e14 = $100, 1e16 = $10K, 1e18 = $1M.
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

                // Fund bob if his balance is short for big mints.
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
        vault = new CreatorVault(
            IERC20(address(usdc)),
            creator,
            admin,
            "Theorise BTC Long",
            "tVAULT"
        );
        vm.mockCall(HLConstants.CORE_WRITER, bytes(""), bytes(""));
        _setCoreSpot(0);
        _setCorePerp(0);

        usdc.mint(creator, 10_000_000e6);
        usdc.mint(bob, 10_000_000e6);
        vm.prank(creator); usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);     usdc.approve(address(vault), type(uint256).max);

        vm.prank(creator);
        vault.deposit(100e6, creator);
        _settleBridge(100e6);
    }

    // ─── previewDeposit / previewMint ─────────────────────────────────

    function test_previewDeposit_no_fee() public {
        assertEq(vault.previewDeposit(100e6), 1e14);
    }

    function test_previewDeposit_with_fee() public {
        vm.prank(admin); vault.setDepositFee(100, treasury); // 1%
        assertEq(vault.previewDeposit(100e6), 99e6 * 1e6);
    }

    function test_previewMint_no_fee_first_deposit() public {
        assertEq(vault.previewMint(1e14), 100e6);
    }

    function test_previewMint_with_fee_grosses_up() public {
        vm.prank(admin); vault.setDepositFee(100, treasury);

        // First deposit to bootstrap.
        vm.prank(creator);
        vault.deposit(100e6, creator); // 99e6 net → 99e12 shares
        _settleBridge(99e6);

        uint256 want = 99e12; // mirror bootstrap shares for clean math
        uint256 gross = vault.previewMint(want);
        // gross such that gross * (1 - 1%) == 99e6 → gross == 100e6 (rounded up)
        assertGe(gross, 100e6);
        assertLe(gross, 100e6 + 1);
    }

    // ─── Bridge accounting + sweep ──────────────────────────────────

    function test_deposit_bridges_full_net_to_system_address() public {
        vm.prank(creator);
        vault.deposit(500e6, creator);

        assertEq(usdc.balanceOf(address(vault)), 0);
        assertEq(usdc.balanceOf(HLConstants.USDC_SYSTEM_ADDRESS), 500e6);
    }

    function test_deposit_with_fee_skim_evm_side() public {
        vm.prank(admin); vault.setDepositFee(100, treasury); // 1%
        vm.prank(creator);
        vault.deposit(500e6, creator);

        // Fee 5e6 stays on EVM with treasury; net 495e6 bridges.
        assertEq(usdc.balanceOf(treasury), 5e6);
        assertEq(usdc.balanceOf(HLConstants.USDC_SYSTEM_ADDRESS), 495e6);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_sweep_when_empty_is_noop() public {
        vault.sweepStrandedEvmUsdc(); // no revert
        assertEq(usdc.balanceOf(HLConstants.USDC_SYSTEM_ADDRESS), 0);
    }

    function test_sweep_bridges_donations() public {
        // Donor sends USDC directly to vault (bypassing deposit).
        vm.prank(alice);
        usdc.transfer(address(vault), 25e6);
        assertEq(usdc.balanceOf(address(vault)), 25e6);

        vault.sweepStrandedEvmUsdc();

        assertEq(usdc.balanceOf(address(vault)), 0);
        assertEq(usdc.balanceOf(HLConstants.USDC_SYSTEM_ADDRESS), 25e6);
    }

    function test_sweep_emits_event() public {
        vm.prank(alice);
        usdc.transfer(address(vault), 25e6);

        vm.expectEmit(false, false, false, true, address(vault));
        emit CreatorVault.StrandedUsdcSwept(25e6);
        vault.sweepStrandedEvmUsdc();
    }

    // ─── Async-window behaviour ─────────────────────────────────────

    /// @notice Demonstrates the async-bridge sandwich window the protocol's
    ///         Phase 2 latency measurement exists to size. If two deposits
    ///         land before either bridge settles, the SECOND deposit prices
    ///         against pre-bridge NAV (which still excludes the first
    ///         deposit's in-flight USDC) and gets MORE shares per USDC than
    ///         the first depositor. Test asserts the divergence — the bug
    ///         exists by design and waits on Phase 2 to determine if a
    ///         mitigation is required.
    function test_async_two_deposits_same_block_diverge() public {
        // Bootstrap to $1M.
        vm.prank(creator);
        vault.deposit(1_000_000e6, creator);
        _settleBridge(1_000_000e6);

        uint256 supplyBefore = vault.totalSupply();
        uint256 navBefore = vault.totalAssets();

        // Alice deposits $100K — pre-bridge NAV = $1M.
        vm.prank(alice);
        uint256 aliceShares = vault.deposit(100_000e6, alice);

        // Bob deposits $1K with NO settlement in between — pre-bridge NAV
        // still reads $1M but totalSupply is now $1M + alice's mint, so
        // each USDC of bob's deposit buys MORE shares than alice's did.
        vm.prank(bob);
        uint256 bobShares = vault.deposit(1_000e6, bob);

        uint256 aliceRate = aliceShares / 100_000; // shares per USDC
        uint256 bobRate   = bobShares   / 1_000;

        // Bob gets at least 5% more shares per USDC than alice — exploit window.
        assertGt(bobRate, aliceRate, "bob did not get cheaper shares");
        assertGe(
            (bobRate - aliceRate) * 100 / aliceRate,
            5,
            "divergence under 5%"
        );

        // After both bridges settle, NAV catches up.
        _settleBridge(101_000e6);
        assertEq(vault.totalAssets(), navBefore + 101_000e6);
        assertEq(vault.totalSupply(), supplyBefore + aliceShares + bobShares);
    }

    /// @notice Sequential deposits across a settled bridge: the second
    ///         deposit sees the first's settled credit and prices fairly.
    function test_sync_two_deposits_with_settlement_between() public {
        vm.prank(creator);
        vault.deposit(1_000_000e6, creator);
        _settleBridge(1_000_000e6);

        vm.prank(alice);
        uint256 aliceShares = vault.deposit(100_000e6, alice);
        _settleBridge(100_000e6);

        vm.prank(bob);
        uint256 bobShares = vault.deposit(1_000e6, bob);
        _settleBridge(1_000e6);

        // Bob's per-USDC share count should be SLIGHTLY less than Alice's
        // (Alice's NAV grew her share value, sort of). Actually with a
        // pure $-in $-out vault and zero PnL, both should be equal. The
        // virtual-shares offset means rates converge as supply grows.
        uint256 aliceRate = aliceShares / 100_000;
        uint256 bobRate   = bobShares   / 1_000;
        // Floor rounding may bite by 1; same order of magnitude.
        assertApproxEqRel(aliceRate, bobRate, 1e15);
    }

    // ─── Deposit fee admin ─────────────────────────────────────────

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

    function test_fee_zero_recipient_disables_skim() public {
        vm.prank(admin);
        vault.setDepositFee(100, address(0));

        vm.prank(creator);
        uint256 shares = vault.deposit(100e6, creator);

        // No fee skimmed: full 100e6 bridged.
        assertEq(usdc.balanceOf(HLConstants.USDC_SYSTEM_ADDRESS), 100e6);
        assertEq(shares, 1e14);
    }

    // ─── Stake invariant: breach state machine ─────────────────────────

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
        // Note: a transient false-positive breach may be flagged inside bob's
        // deposit() because share-pricing reads pre-bridge totalAssets while
        // creator's stake is computed against post-mint supply. This self-
        // heals on the next state-mutating call (the redemption below). The
        // test checks the FINAL breach state, not the transient one.

        // Creator redeems $50K via redeemCore.
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

        // maxDeposit drops to zero.
        assertEq(vault.maxDeposit(alice), 0);
        assertEq(vault.maxMint(alice), 0);

        // And actual deposits revert via the cure guard.
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

        // Creator tops up to >5% of new TVL.
        vm.prank(creator); vault.deposit(200_000e6, creator);
        _settleBridge(200_000e6);

        assertEq(vault.stakeBreachStartedAt(), 0);
    }

    function test_breach_state_resets_when_supply_zero() public {
        vm.prank(creator); vault.deposit(5_000e6, creator);
        _settleBridge(5_000e6);
        vm.prank(bob); vault.deposit(195_000e6, bob);
        _settleBridge(195_000e6);

        // Bob redeems all.
        uint256 bobShares = vault.balanceOf(bob);
        vm.prank(bob);
        uint256 bobAmt = vault.redeemCore(bobShares, bob);
        _setCoreSpot(coreSpot - bobAmt);

        // Then creator redeems all.
        uint256 creatorShares = vault.balanceOf(creator);
        vm.prank(creator);
        uint256 creatorAmt = vault.redeemCore(creatorShares, creator);
        _setCoreSpot(coreSpot - creatorAmt);

        assertEq(vault.totalSupply(), 0);
        assertEq(vault.stakeBreachStartedAt(), 0);
    }

    // ─── Stake cap admin ───────────────────────────────────────────

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

    function test_non_admin_cannot_set_cap() public {
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

    // ─── redeemCore ─────────────────────────────────────────────

    function test_redeem_creator_alone() public {
        vm.prank(creator); vault.deposit(500e6, creator);
        _settleBridge(500e6);

        uint256 sh = vault.balanceOf(creator);
        vm.prank(creator);
        uint256 amount = vault.redeemCore(sh, creator);

        assertApproxEqAbs(amount, 500e6, 1e3);
        assertEq(vault.totalSupply(), 0);
    }

    function test_redeem_insufficient_spot_reverts() public {
        vm.prank(creator); vault.deposit(100e6, creator);
        _settleBridge(100e6);

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

    // ─── Trading actions: access control ──────────────────────────────

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
}
