// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vault} from "../src/Vault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {HLConstants} from "../src/HLConstants.sol";

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

/// Captures every CoreWriter action so tests can inspect what was sent.
contract CapturingCoreWriter {
    bytes[] public calls;
    function sendRawAction(bytes calldata data) external { calls.push(data); }
    function callsCount() external view returns (uint256) { return calls.length; }
    function getCall(uint256 i) external view returns (bytes memory) { return calls[i]; }
}

contract VaultPhaseBTest is Test {
    MockUSDC usdc;
    VaultFactory factory;
    Vault impl;
    address creator = address(0xC0DE);
    address alice = address(0xA11CE);
    address treasury = address(0xFEE5);
    address depositWallet = address(0xD1ED);

    // BTC (asset 0, szDec=5) long 50%, ETH (asset 1, szDec=4) long 50%, 3x each
    function _baseSpec() internal pure returns (Vault.Position[] memory p) {
        p = new Vault.Position[](2);
        p[0] = Vault.Position({ asset: 0, isBuy: true, allocBps: 5000, lev: 3, szDecimals: 5 });
        p[1] = Vault.Position({ asset: 1, isBuy: true, allocBps: 5000, lev: 3, szDecimals: 4 });
    }

    function setUp() public {
        usdc = new MockUSDC();
        impl = new Vault();
        // coreRoutingEnabled = true, deploymentFee = 0 (phase B tests care about routing, not fees)
        factory = new VaultFactory(address(impl), address(usdc), depositWallet, treasury, true, 0);

        usdc.mint(creator, 1_000e6);
        usdc.mint(alice, 1_000e6);

        // Install capturing CoreWriter at the HyperEVM system address.
        CapturingCoreWriter cw = new CapturingCoreWriter();
        vm.etch(HLConstants.CORE_WRITER, address(cw).code);

        // Mock the mark-px precompile:
        //   BTC (asset 0): $67,000 with szDecimals=5 → markPx = 670000
        //   ETH (asset 1): $3,500 with szDecimals=4 → markPx = 350000
        vm.mockCall(
            HLConstants.MARK_PX_PRECOMPILE,
            abi.encode(uint32(0)),
            abi.encode(uint64(670000))
        );
        vm.mockCall(
            HLConstants.MARK_PX_PRECOMPILE,
            abi.encode(uint32(1)),
            abi.encode(uint64(350000))
        );
    }

    function _create(uint64 expiry, uint256 creatorIM) internal returns (Vault v) {
        vm.prank(creator);
        usdc.approve(address(factory), creatorIM);
        vm.prank(creator);
        v = Vault(factory.createVault(_baseSpec(), expiry, creatorIM, 0));
    }

    function _cw() internal pure returns (CapturingCoreWriter) {
        return CapturingCoreWriter(HLConstants.CORE_WRITER);
    }

    // ── Routing behavior ─────────────────────────────────────────

    function test_coreRouting_bridgesUsdcOnInit() public {
        Vault v = _create(uint64(block.timestamp + 7 days), 100e6);
        // USDC left the vault (routed to the bridge) and the bridge holds it.
        assertEq(usdc.balanceOf(address(v)), 0);
        assertEq(usdc.balanceOf(depositWallet), 100e6);
    }

    function test_coreRouting_firesExpectedCoreWriterCalls() public {
        _create(uint64(block.timestamp + 7 days), 100e6);

        // Expect: 1 spot→perp (action 7) + 2 IOC orders (action 1) = 3 calls.
        assertEq(_cw().callsCount(), 3);

        bytes memory callTransfer = _cw().getCall(0);
        bytes memory callBtc = _cw().getCall(1);
        bytes memory callEth = _cw().getCall(2);

        // All calls prefixed with 0x01 (version) + 3-byte action id.
        assertEq(uint8(callTransfer[0]), 0x01);
        assertEq(uint8(callTransfer[3]), 0x07, "action 7 USD_CLASS_TRANSFER");
        assertEq(uint8(callBtc[3]), 0x01, "action 1 LIMIT_ORDER (BTC)");
        assertEq(uint8(callEth[3]), 0x01, "action 1 LIMIT_ORDER (ETH)");
    }

    function test_coreRouting_spotToPerpEncodesFullAmount() public {
        _create(uint64(block.timestamp + 7 days), 100e6);
        bytes memory data = _cw().getCall(0);

        // Decode payload (bytes 4..).
        bytes memory payload = _slice(data, 4);
        (uint64 ntl, bool toPerp) = abi.decode(payload, (uint64, bool));
        assertEq(ntl, 100e6, "spot->perp moves all bridged USDC");
        assertTrue(toPerp);
    }

    function test_coreRouting_btcOrderEncodingAndScaling() public {
        _create(uint64(block.timestamp + 7 days), 100e6);
        bytes memory data = _cw().getCall(1);
        bytes memory payload = _slice(data, 4);

        (uint32 asset, bool isBuy, uint64 limitPx, uint64 sz, bool reduceOnly, uint8 tif, uint128 cloid)
            = abi.decode(payload, (uint32, bool, uint64, uint64, bool, uint8, uint128));

        // posIM = 50e6, posNotional = 150e6, mark = 670000 (BTC @ $67k, szDec=5)
        // px_1e8 mark = 670000 * 10^7 = 6.7e12
        // limitPx buy = 6.7e12 * 1.05 = 7.035e12
        // sz_1e8 = 150e6 * 1e8 / (670000 * 10^5) = 1.5e16 / 6.7e10 ≈ 223880
        assertEq(asset, 0);
        assertTrue(isBuy);
        assertEq(limitPx, uint64(7_035_000_000_000));
        assertEq(sz, uint64(223_880));
        assertFalse(reduceOnly);
        assertEq(tif, HLConstants.TIF_IOC);
        assertEq(cloid, 0);
    }

    function test_coreRouting_ethOrderEncodingAndScaling() public {
        _create(uint64(block.timestamp + 7 days), 100e6);
        bytes memory data = _cw().getCall(2);
        bytes memory payload = _slice(data, 4);

        (uint32 asset, bool isBuy, uint64 limitPx, uint64 sz, , uint8 tif,) =
            abi.decode(payload, (uint32, bool, uint64, uint64, bool, uint8, uint128));

        // posIM = 50e6, posNotional = 150e6, mark = 350000 (ETH @ $3.5k, szDec=4)
        // px_1e8 mark = 350000 * 10^6 = 3.5e11
        // limitPx buy = 3.5e11 * 1.05 = 3.675e11
        // sz_1e8 = 150e6 * 1e8 / (350000 * 10^4) = 1.5e16 / 3.5e9 ≈ 4285714
        assertEq(asset, 1);
        assertTrue(isBuy);
        assertEq(limitPx, uint64(367_500_000_000));
        assertEq(sz, uint64(4_285_714));
        assertEq(tif, HLConstants.TIF_IOC);
    }

    function test_coreRouting_depositReroutesToCore() public {
        Vault v = _create(uint64(block.timestamp + 7 days), 100e6);
        uint256 preCalls = _cw().callsCount();

        vm.prank(alice);
        usdc.approve(address(v), 50e6);
        vm.prank(alice);
        v.deposit(50e6);

        // Deposit fires another 3 CoreWriter calls: spot→perp + 2 IOCs.
        assertEq(_cw().callsCount() - preCalls, 3);

        // Alice's 50 USDC bridged straight through; vault EVM balance is zero.
        assertEq(usdc.balanceOf(address(v)), 0);
        assertEq(usdc.balanceOf(depositWallet), 150e6);
    }

    function test_coreRouting_earlyWithdrawBlockedWhenUsdcOnCore() public {
        Vault v = _create(uint64(block.timestamp + 7 days), 100e6);

        vm.prank(alice);
        usdc.approve(address(v), 50e6);
        vm.prank(alice);
        v.deposit(50e6);

        // USDC has been bridged — vault holds none on EVM.
        // earlyWithdraw must revert so users aren't given a refund that can't be paid.
        vm.prank(alice);
        vm.expectRevert(Vault.InsufficientBalance.selector);
        v.earlyWithdraw(10e6);
    }

    function test_coreRouting_unwindIsStillStubbedPhaseC() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        Vault v = _create(expiry, 100e6);
        uint256 preCalls = _cw().callsCount();

        vm.warp(expiry);
        v.settle();

        // Phase C will fill settle with unwind orders; for now, no CoreWriter calls.
        assertEq(_cw().callsCount(), preCalls);
        assertTrue(v.settled());
    }

    function test_coreRouting_claimRevertsIfUsdcNotRepatriated() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        Vault v = _create(expiry, 100e6);
        vm.warp(expiry);
        v.settle();

        uint256 creatorShares = v.shares(creator);
        vm.prank(creator);
        vm.expectRevert(Vault.InsufficientBalance.selector);
        v.claim(creatorShares);
    }

    // ── Helper ───────────────────────────────────────────────────

    function _slice(bytes memory src, uint256 start) internal pure returns (bytes memory out) {
        out = new bytes(src.length - start);
        for (uint256 i = 0; i < out.length; i++) out[i] = src[i + start];
    }
}
