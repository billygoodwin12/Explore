// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Vault} from "../src/Vault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";

/// Minimal ERC20 stand-in for USDC (6 dp). No fee-on-transfer, returns bool.
contract MockUSDC {
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "bal");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "bal");
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allow");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// Test-only vault with penalty turned on so we can verify fee math.
contract PenaltyVault is Vault {
    function earlyExitBps() public pure override returns (uint16) { return 200; } // 2%
}

contract VaultTest is Test {
    MockUSDC usdc;
    VaultFactory factory;
    Vault impl;
    address creator = address(0xC0DE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address treasury = address(0xFEE5);
    address depositWallet = address(0xD1ED);

    // 50/50 BTC long + ETH long, 3x lev each
    function _baseSpec() internal pure returns (Vault.Position[] memory p) {
        p = new Vault.Position[](2);
        p[0] = Vault.Position({ asset: 0, isBuy: true, allocBps: 5000, lev: 3, szDecimals: 5 });
        p[1] = Vault.Position({ asset: 1, isBuy: true, allocBps: 5000, lev: 3, szDecimals: 4 });
    }

    function setUp() public {
        usdc = new MockUSDC();
        impl = new Vault();
        // coreRoutingEnabled = false (Phase A behavior for the core test suite)
        factory = new VaultFactory(address(impl), address(usdc), depositWallet, treasury, false);

        usdc.mint(creator, 1_000e6);
        usdc.mint(alice, 1_000e6);
        usdc.mint(bob, 1_000e6);
    }

    function _create(uint64 expiry, uint256 creatorIM) internal returns (Vault v) {
        vm.prank(creator);
        usdc.approve(address(factory), creatorIM);
        vm.prank(creator);
        v = Vault(factory.createVault(_baseSpec(), expiry, creatorIM));
    }

    // ── Init ─────────────────────────────────────────────────────

    function test_initialize_setsEverything() public {
        uint64 expiry = uint64(block.timestamp + 7 days);
        Vault v = _create(expiry, 100e6);

        assertEq(v.creator(), creator);
        assertEq(v.expiryTs(), expiry);
        assertEq(v.creatorLockedIM(), 100e6);
        assertEq(v.totalIM(), 100e6);
        assertEq(v.totalShares(), 100e6);
        assertEq(v.shares(creator), 100e6);
        assertEq(v.positionsCount(), 2);
        assertEq(usdc.balanceOf(address(v)), 100e6);
    }

    function test_initialize_revertsOnBadAllocSum() public {
        Vault.Position[] memory bad = new Vault.Position[](2);
        bad[0] = Vault.Position({ asset: 0, isBuy: true, allocBps: 5000, lev: 3, szDecimals: 5 });
        bad[1] = Vault.Position({ asset: 1, isBuy: true, allocBps: 4000, lev: 3, szDecimals: 4 }); // only 90%

        uint64 expiry = uint64(block.timestamp + 7 days);
        vm.prank(creator);
        usdc.approve(address(factory), 100e6);
        vm.prank(creator);
        vm.expectRevert(Vault.InvalidAlloc.selector);
        factory.createVault(bad, expiry, 100e6);
    }

    function test_initialize_cannotBeCalledTwice() public {
        Vault v = _create(uint64(block.timestamp + 7 days), 100e6);
        vm.expectRevert(Vault.AlreadyInitialized.selector);
        v.initialize(
            address(factory), creator, address(usdc), depositWallet, treasury,
            uint64(block.timestamp + 1 days), false, _baseSpec(), 1e6
        );
    }

    function test_initialize_rejectsNonFactoryCaller() public {
        Vault fresh = new Vault();
        // Claim factory == 0xdead, but msg.sender is this contract.
        vm.expectRevert(Vault.NotFactory.selector);
        fresh.initialize(
            address(0xdead), creator, address(usdc), depositWallet, treasury,
            uint64(block.timestamp + 1 days), false, _baseSpec(), 1e6
        );
    }

    // ── Deposit share math ───────────────────────────────────────

    function test_deposit_mintsProportionalShares() public {
        Vault v = _create(uint64(block.timestamp + 7 days), 100e6);

        vm.prank(alice);
        usdc.approve(address(v), 50e6);
        vm.prank(alice);
        v.deposit(50e6);

        // Alice deposits 50 USDC into a pool with 100 USDC / 100 shares
        // → gets 50 shares. Total shares=150, totalIM=150.
        assertEq(v.shares(alice), 50e6);
        assertEq(v.totalShares(), 150e6);
        assertEq(v.totalIM(), 150e6);
    }

    function test_deposit_closedAfterExpiry() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        Vault v = _create(expiry, 100e6);

        vm.warp(expiry);
        vm.prank(alice);
        usdc.approve(address(v), 10e6);
        vm.prank(alice);
        vm.expectRevert(Vault.Closed.selector);
        v.deposit(10e6);
    }

    // ── Early exit ───────────────────────────────────────────────

    function test_earlyWithdraw_creatorLocked() public {
        Vault v = _create(uint64(block.timestamp + 7 days), 100e6);
        vm.prank(creator);
        vm.expectRevert(Vault.CreatorLocked.selector);
        v.earlyWithdraw(1e6);
    }

    function test_earlyWithdraw_zeroBps_fullRefund() public {
        Vault v = _create(uint64(block.timestamp + 7 days), 100e6);

        vm.prank(alice);
        usdc.approve(address(v), 50e6);
        vm.prank(alice);
        v.deposit(50e6);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 aliceShares = v.shares(alice);
        vm.prank(alice);
        v.earlyWithdraw(aliceShares);

        // Default earlyExitBps() = 0 → alice gets her full 50 back, no fee.
        assertEq(usdc.balanceOf(alice) - aliceBefore, 50e6);
        assertEq(v.shares(alice), 0);
        assertEq(v.totalShares(), 100e6);
        assertEq(v.totalIM(), 100e6);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function test_earlyWithdraw_withPenaltySplitsFees() public {
        // Swap in a penalty-enabled impl to test the fee path.
        Vault penaltyImpl = new PenaltyVault();
        VaultFactory pf = new VaultFactory(
            address(penaltyImpl), address(usdc), depositWallet, treasury, false
        );
        vm.prank(creator);
        usdc.approve(address(pf), 100e6);
        vm.prank(creator);
        Vault v = Vault(pf.createVault(_baseSpec(), uint64(block.timestamp + 7 days), 100e6));

        vm.prank(alice);
        usdc.approve(address(v), 100e6);
        vm.prank(alice);
        v.deposit(100e6);
        // State: totalIM=200, totalShares=200, alice owns 100.

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        v.earlyWithdraw(100e6);

        // Gross = 100. Fee = 2 (200 bps). Split 1/1.
        // Alice gets 98, treasury gets 1, 1 stays in vault for LPs.
        assertEq(usdc.balanceOf(alice) - aliceBefore, 98e6);
        assertEq(usdc.balanceOf(treasury), 1e6);
        // totalIM = 200 - (100 - 1) = 101 (the 1 that stayed is still counted).
        assertEq(v.totalIM(), 101e6);
        assertEq(v.totalShares(), 100e6);
        // Per-share NAV jumped: creator's 100 shares now back 101 USDC.
    }

    function test_earlyWithdraw_revertsAfterSettle() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        Vault v = _create(expiry, 100e6);

        vm.prank(alice);
        usdc.approve(address(v), 50e6);
        vm.prank(alice);
        v.deposit(50e6);

        vm.warp(expiry);
        v.settle();

        vm.prank(alice);
        vm.expectRevert(Vault.AlreadySettled.selector);
        v.earlyWithdraw(1);
    }

    // ── Settle ───────────────────────────────────────────────────

    function test_settle_revertsBeforeExpiry() public {
        Vault v = _create(uint64(block.timestamp + 7 days), 100e6);
        vm.expectRevert(Vault.NotExpired.selector);
        v.settle();
    }

    function test_settle_permissionlessAfterExpiry() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        Vault v = _create(expiry, 100e6);
        vm.warp(expiry);

        // Random caller can settle — keeper fallback.
        vm.prank(address(0xBEEF));
        v.settle();
        assertTrue(v.settled());
    }

    function test_settle_notTwice() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        Vault v = _create(expiry, 100e6);
        vm.warp(expiry);
        v.settle();
        vm.expectRevert(Vault.AlreadySettled.selector);
        v.settle();
    }

    // ── Claim ────────────────────────────────────────────────────

    function test_claim_creatorAndDepositorGetProRata() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        Vault v = _create(expiry, 100e6);

        vm.prank(alice);
        usdc.approve(address(v), 50e6);
        vm.prank(alice);
        v.deposit(50e6);

        vm.warp(expiry);
        v.settle();

        uint256 creatorBefore = usdc.balanceOf(creator);
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 creatorShares = v.shares(creator);
        uint256 aliceShares = v.shares(alice);

        vm.prank(creator);
        v.claim(creatorShares);
        vm.prank(alice);
        v.claim(aliceShares);

        // Vault held 150 USDC; creator had 100/150 shares, alice 50/150.
        assertEq(usdc.balanceOf(creator) - creatorBefore, 100e6);
        assertEq(usdc.balanceOf(alice) - aliceBefore, 50e6);
        assertEq(v.totalShares(), 0);
        assertEq(v.totalIM(), 0);
    }

    function test_claim_revertsBeforeSettle() public {
        Vault v = _create(uint64(block.timestamp + 7 days), 100e6);
        vm.prank(creator);
        vm.expectRevert(Vault.NotSettled.selector);
        v.claim(1);
    }

    // ── Spec enforcement hooks (Phase A stubs just emit) ─────────

    function test_deploy_hookFiresOnInitAndDeposit() public {
        uint64 expiry = uint64(block.timestamp + 7 days);
        Vault v;

        vm.prank(creator);
        usdc.approve(address(factory), 100e6);
        vm.expectEmit(false, false, false, true);
        emit Vault.DeployRequested(100e6);
        vm.prank(creator);
        v = Vault(factory.createVault(_baseSpec(), expiry, 100e6));

        vm.prank(alice);
        usdc.approve(address(v), 25e6);
        vm.expectEmit(false, false, false, true);
        emit Vault.DeployRequested(25e6);
        vm.prank(alice);
        v.deposit(25e6);
    }

    function test_positionsHash_matchesInputSpec() public {
        Vault v = _create(uint64(block.timestamp + 7 days), 100e6);
        assertEq(v.positionsHash(), keccak256(abi.encode(_baseSpec())));
    }
}
