// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Test} from "forge-std/Test.sol";
import {Midnight} from "midnight/Midnight.sol";
import {Market, CollateralParams, Offer} from "midnight/interfaces/IMidnight.sol";
import {EcrecoverRatifier} from "midnight/ratifiers/EcrecoverRatifier.sol";
import {Signature, IEcrecoverRatifier} from "midnight/ratifiers/interfaces/IEcrecoverRatifier.sol";
import {IMidnight} from "midnight/interfaces/IMidnight.sol";
import {HashHelper} from "../src/HashHelper.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {MockOracle} from "../src/MockOracle.sol";

/// @dev Acceptance gate for all struct/hash/encoding logic (build spec section 6.3).
/// Full lifecycle with two actors: maker A (lender) posts a buy offer signed off-chain,
/// borrower B supplies collateral and takes it; then the sell-offer direction; then
/// repay / withdraw / withdrawCollateral, asserting balances net out.
contract EndToEndTest is Test {
    uint256 constant WAD = 1e18;
    uint256 constant TICK_SPACING = 4;

    Midnight midnight;
    EcrecoverRatifier ratifier;
    HashHelper helper;
    MockERC20 mUSDC;
    MockERC20 mWETH;
    MockOracle oracle; // WETH/USDC

    Market market;

    uint256 pkA = 0xA11CE;
    uint256 pkB = 0xB0B;
    address a; // Desk A — maker/lender in act 1
    address b; // Desk B — taker/borrower in act 1

    function setUp() public {
        a = vm.addr(pkA);
        b = vm.addr(pkB);

        midnight = new Midnight();
        ratifier = new EcrecoverRatifier(address(midnight));
        helper = new HashHelper();
        mUSDC = new MockERC20("Mock USDC", "mUSDC", 6);
        mWETH = new MockERC20("Mock WETH", "mWETH", 18);
        // humanPrice 2500, 10^(36 + 6 - 18) = 10^24
        oracle = new MockOracle(2_500e24);

        // deployer is configurator
        midnight.enableLltv(0.86e18);
        midnight.enableLiquidationCursor(0.3e18);

        CollateralParams[] memory cps = new CollateralParams[](1);
        cps[0] = CollateralParams({
            token: address(mWETH),
            lltv: 0.86e18,
            liquidationCursor: 0.3e18,
            oracle: address(oracle)
        });
        market = Market({
            chainId: block.chainid,
            midnight: address(midnight),
            loanToken: address(mUSDC),
            collateralParams: cps,
            maturity: block.timestamp + 30 days,
            rcfThreshold: 10e6,
            enterGate: address(0),
            liquidatorGate: address(0)
        });
        midnight.touchMarket(market);
    }

    function marketId() internal returns (bytes32) {
        return midnight.touchMarket(market);
    }

    function _signOffer(Offer memory offer, uint256 pk) internal view returns (bytes memory ratifierData) {
        bytes32 root = helper.hashOffer(offer);
        bytes32 digest = helper.digestSingle(offer, address(ratifier));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        ratifierData = abi.encode(Signature({v: v, r: r, s: s}), root, uint256(0), new bytes32[](0));
    }

    function _baseOffer(bool buy, address maker) internal view returns (Offer memory) {
        return Offer({
            market: market,
            buy: buy,
            maker: maker,
            start: block.timestamp == 0 ? 0 : block.timestamp - 1,
            expiry: block.timestamp + 7 days,
            tick: 0, // set by caller
            group: 0, // set by caller
            callback: address(0),
            callbackData: "",
            receiverIfMakerIsSeller: buy ? address(0) : maker,
            ratifier: address(ratifier),
            reduceOnly: false,
            maxUnits: 0, // set by caller
            maxAssets: 0,
            continuousFeeCap: 1e18
        });
    }

    function testFullCycleBuyThenSellOffer() public {
        bytes32 id = marketId();

        // Tick from a target price of ~0.995 (≈ 6.1% simple over 30d remaining term).
        uint256 tick = helper.priceToTick(0.995e18, TICK_SPACING);
        uint256 price = helper.tickToPrice(tick);
        assertGe(price, 0.995e18);
        assertEq(tick % TICK_SPACING, 0);

        /// ------ Act 1: maker A posts a buy (lend) offer, B takes it (borrows) ------

        uint128 maxUnits = 10_000e6; // 10,000 mUSDC of units
        Offer memory buyOffer = _baseOffer(true, a);
        buyOffer.tick = tick;
        buyOffer.group = keccak256("group-1");
        buyOffer.maxUnits = maxUnits;

        bytes memory ratifierData = _signOffer(buyOffer, pkA);

        // Maker preconditions: authorize ratifier, fund + approve loan token.
        vm.prank(a);
        midnight.setIsAuthorized(address(ratifier), true, a);
        mUSDC.mint(a, 100_000e6);
        vm.prank(a);
        mUSDC.approve(address(midnight), type(uint256).max);

        uint256 units = 5_000e6;
        uint256 buyerAssets = units * price / WAD; // fee = 0 on fresh deployments

        // SelfTake is enforced.
        vm.prank(a);
        vm.expectRevert(IMidnight.SelfTake.selector);
        midnight.take(buyOffer, ratifierData, units, a, a, address(0), "");

        // Taking without collateral reverts: seller health is checked at the end of take.
        vm.prank(b);
        vm.expectRevert(IMidnight.SellerIsLiquidatable.selector);
        midnight.take(buyOffer, ratifierData, units, b, b, address(0), "");

        // B supplies collateral: needed = debt * 1e36 / (oraclePrice * lltv / WAD), padded to HF 1.25.
        uint256 collateralNeeded = units * 1e36 / (2_500e24 * 0.86e18 / WAD) * 125 / 100;
        mWETH.mint(b, collateralNeeded);
        vm.startPrank(b);
        mWETH.approve(address(midnight), type(uint256).max);
        midnight.supplyCollateral(market, 0, collateralNeeded, b);
        vm.stopPrank();

        uint256 aBal0 = mUSDC.balanceOf(a);
        uint256 bBal0 = mUSDC.balanceOf(b);

        vm.prank(b);
        (uint256 outBuyerAssets, uint256 outSellerAssets) =
            midnight.take(buyOffer, ratifierData, units, b, b, address(0), "");

        assertEq(outBuyerAssets, buyerAssets, "buyerAssets");
        assertEq(outSellerAssets, buyerAssets, "sellerAssets == buyerAssets (zero fee)");
        // Buyer pays the seller directly: A -> B, nothing locked in the singleton.
        assertEq(mUSDC.balanceOf(a), aBal0 - buyerAssets, "A paid discounted amount");
        assertEq(mUSDC.balanceOf(b), bBal0 + buyerAssets, "B received discounted amount");
        assertEq(midnight.credit(id, a), units, "A credit");
        assertEq(midnight.debt(id, b), units, "B debt");
        assertEq(midnight.consumed(a, buyOffer.group), units, "group consumption");

        /// ------ Act 2: borrower B posts a sell (borrow) offer, A takes it (lends) ------

        uint256 units2 = 2_000e6;
        Offer memory sellOffer = _baseOffer(false, b);
        sellOffer.tick = tick;
        sellOffer.group = keccak256("group-2");
        sellOffer.maxUnits = uint128(units2);

        bytes memory ratifierData2 = _signOffer(sellOffer, pkB);

        vm.prank(b);
        midnight.setIsAuthorized(address(ratifier), true, b);

        // B needs more collateral to stay healthy with units + units2 of debt.
        uint256 extraCollateral = units2 * 1e36 / (2_500e24 * 0.86e18 / WAD) * 125 / 100;
        mWETH.mint(b, extraCollateral);
        vm.prank(b);
        midnight.supplyCollateral(market, 0, extraCollateral, b);

        uint256 buyerAssets2 = (units2 * price + WAD - 1) / WAD; // sell offers round up

        // Receiver rules: taking a sell offer requires receiverIfTakerIsSeller == 0.
        vm.prank(a);
        vm.expectRevert(IMidnight.UnusedReceiverMustBeZero.selector);
        midnight.take(sellOffer, ratifierData2, units2, a, a, address(0), "");

        uint256 aBal1 = mUSDC.balanceOf(a);
        uint256 bBal1 = mUSDC.balanceOf(b);
        // Taker (A) is the payer on sell offers; allowance already set.
        vm.prank(a);
        midnight.take(sellOffer, ratifierData2, units2, a, address(0), address(0), "");

        assertEq(mUSDC.balanceOf(a), aBal1 - buyerAssets2, "A paid for sell offer");
        assertEq(mUSDC.balanceOf(b), bBal1 + buyerAssets2, "B received via receiverIfMakerIsSeller");
        assertEq(midnight.credit(id, a), units + units2, "A total credit");
        assertEq(midnight.debt(id, b), units + units2, "B total debt");

        /// ------ Act 3: unwind before maturity — repay, withdraw, reclaim collateral ------

        uint256 totalDebt = units + units2;
        // B repays at par; top up the difference between debt and what B received.
        mUSDC.mint(b, totalDebt - mUSDC.balanceOf(b) + bBal0);
        vm.startPrank(b);
        mUSDC.approve(address(midnight), type(uint256).max);
        midnight.repay(market, totalDebt, b, address(0), "");
        vm.stopPrank();

        assertEq(midnight.debt(id, b), 0, "B debt cleared");
        assertEq(midnight.withdrawable(id), totalDebt, "withdrawable grew on repay");

        // No maturity gate on withdraw: A redeems credit 1:1 immediately.
        uint256 aBal2 = mUSDC.balanceOf(a);
        vm.prank(a);
        midnight.withdraw(market, totalDebt, a, a);
        assertEq(mUSDC.balanceOf(a), aBal2 + totalDebt, "A redeemed units 1:1");
        assertEq(midnight.credit(id, a), 0, "A credit cleared");

        // B reclaims all collateral now that debt is zero.
        uint256 totalCollateral = collateralNeeded + extraCollateral;
        vm.prank(b);
        midnight.withdrawCollateral(market, 0, totalCollateral, b, b);
        assertEq(mWETH.balanceOf(b), totalCollateral, "collateral returned");
        assertEq(midnight.collateral(id, b, 0), 0, "no collateral left");

        // Net P&L in loan token: A earned units - discountedAssets on both fills.
        uint256 aNet = mUSDC.balanceOf(a) - aBal0 + buyerAssets; // careful: aBal0 was after mint
        assertEq(
            mUSDC.balanceOf(a),
            aBal0 - buyerAssets - buyerAssets2 + totalDebt,
            "A net = +units - discounted amounts paid (the fixed rate, realized early)"
        );
        aNet; // silence unused (kept for readability)
    }

    function testCancelRootBlocksTake() public {
        uint256 tick = helper.priceToTick(0.995e18, TICK_SPACING);
        Offer memory offer = _baseOffer(true, a);
        offer.tick = tick;
        offer.group = keccak256("group-cancel");
        offer.maxUnits = 1_000e6;
        bytes memory ratifierData = _signOffer(offer, pkA);

        vm.prank(a);
        midnight.setIsAuthorized(address(ratifier), true, a);
        mUSDC.mint(a, 10_000e6);
        vm.prank(a);
        mUSDC.approve(address(midnight), type(uint256).max);

        bytes32 root = helper.hashOffer(offer);
        vm.prank(a);
        ratifier.cancelRoot(a, root);
        assertTrue(ratifier.isRootCanceled(a, root));

        vm.prank(b);
        vm.expectRevert(IEcrecoverRatifier.RootCanceled.selector);
        midnight.take(offer, ratifierData, 100e6, b, b, address(0), "");
    }

    function testRatifierUnauthorizedWithoutSetIsAuthorized() public {
        uint256 tick = helper.priceToTick(0.995e18, TICK_SPACING);
        Offer memory offer = _baseOffer(true, a);
        offer.tick = tick;
        offer.group = keccak256("group-noauth");
        offer.maxUnits = 1_000e6;
        bytes memory ratifierData = _signOffer(offer, pkA);

        vm.prank(b);
        vm.expectRevert(IMidnight.RatifierUnauthorized.selector);
        midnight.take(offer, ratifierData, 100e6, b, b, address(0), "");
    }

    function testOfferCapsXorEnforced() public {
        uint256 tick = helper.priceToTick(0.995e18, TICK_SPACING);
        Offer memory offer = _baseOffer(true, a);
        offer.tick = tick;
        offer.group = keccak256("group-caps");
        offer.maxUnits = 0;
        offer.maxAssets = 0;
        bytes memory ratifierData = _signOffer(offer, pkA);
        vm.prank(a);
        midnight.setIsAuthorized(address(ratifier), true, a);
        vm.prank(b);
        vm.expectRevert(IMidnight.InvalidOfferCaps.selector);
        midnight.take(offer, ratifierData, 100e6, b, b, address(0), "");
    }

    function testTickSpacingEnforced() public {
        uint256 tick = helper.priceToTick(0.995e18, TICK_SPACING) + 1; // off-grid
        Offer memory offer = _baseOffer(true, a);
        offer.tick = tick;
        offer.group = keccak256("group-tick");
        offer.maxUnits = 1_000e6;
        bytes memory ratifierData = _signOffer(offer, pkA);
        vm.prank(a);
        midnight.setIsAuthorized(address(ratifier), true, a);
        vm.prank(b);
        vm.expectRevert(IMidnight.TickNotAccessible.selector);
        midnight.take(offer, ratifierData, 100e6, b, b, address(0), "");
    }
}
