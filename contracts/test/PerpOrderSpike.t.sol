// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PerpOrderSpike} from "../src/PerpOrderSpike.sol";
import {HLConstants} from "../src/HLConstants.sol";

/// @notice CoreWriter / precompiles don't exist on a vanilla anvil chain,
/// so this suite only verifies the action encoding by mocking CoreWriter
/// and inspecting the bytes the spike would have sent.
contract MockCoreWriter {
    bytes public lastData;

    function sendRawAction(bytes calldata data) external {
        lastData = data;
    }
}

contract PerpOrderSpikeTest is Test {
    PerpOrderSpike spike;
    MockCoreWriter mock;
    address constant USDC = address(0xCafe);
    address constant DEPOSIT = address(0xDeed);

    function setUp() public {
        // Inject the mock in place of the real CoreWriter address.
        mock = new MockCoreWriter();
        vm.etch(HLConstants.CORE_WRITER, address(mock).code);
        spike = new PerpOrderSpike(USDC, DEPOSIT);
    }

    function _capture() internal view returns (bytes memory) {
        return MockCoreWriter(HLConstants.CORE_WRITER).lastData();
    }

    function test_iocOrder_encoding() public {
        // BTC perp (asset 0), buy, $50_000 limit, 0.001 BTC.
        spike.placeIocOrder(0, true, uint64(50_000 * 1e8), uint64(1e5));
        bytes memory data = _capture();

        // Version + action ID.
        assertEq(uint8(data[0]), 0x01, "version");
        assertEq(uint8(data[1]), 0x00, "actionId hi");
        assertEq(uint8(data[2]), 0x00, "actionId mid");
        assertEq(uint8(data[3]), 0x01, "actionId lo (LIMIT_ORDER=1)");

        // ABI payload starts at byte 4 — decode and check the fields.
        bytes memory payload = new bytes(data.length - 4);
        for (uint256 i = 0; i < payload.length; i++) payload[i] = data[i + 4];

        (
            uint32 asset,
            bool isBuy,
            uint64 limitPx,
            uint64 sz,
            bool reduceOnly,
            uint8 tif,
            uint128 cloid
        ) = abi.decode(payload, (uint32, bool, uint64, uint64, bool, uint8, uint128));

        assertEq(asset, 0);
        assertTrue(isBuy);
        assertEq(limitPx, uint64(50_000 * 1e8));
        assertEq(sz, uint64(1e5));
        assertFalse(reduceOnly);
        assertEq(tif, HLConstants.TIF_IOC);
        assertEq(cloid, 0);
    }

    function test_usdClass_encoding() public {
        spike.moveUsdClass(uint64(1_000_000), true); // 1 USDC (6 dp) -> perp
        bytes memory data = _capture();

        assertEq(uint8(data[0]), 0x01);
        assertEq(uint8(data[3]), 0x07, "USD_CLASS_TRANSFER");

        bytes memory payload = new bytes(data.length - 4);
        for (uint256 i = 0; i < payload.length; i++) payload[i] = data[i + 4];

        (uint64 ntl, bool toPerp) = abi.decode(payload, (uint64, bool));
        assertEq(ntl, 1_000_000);
        assertTrue(toPerp);
    }

    function test_onlyOwner() public {
        vm.prank(address(0xBeef));
        vm.expectRevert(PerpOrderSpike.NotOwner.selector);
        spike.placeIocOrder(0, true, 1, 1);
    }
}
