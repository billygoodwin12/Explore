// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Script} from "forge-std/Script.sol";
import {Midnight} from "midnight/Midnight.sol";
import {Market, CollateralParams} from "midnight/interfaces/IMidnight.sol";
import {EcrecoverRatifier} from "midnight/ratifiers/EcrecoverRatifier.sol";
import {HashHelper} from "../src/HashHelper.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {MockOracle} from "../src/MockOracle.sol";

/// @notice Deploys the full Midnight RFQ testnet stack: singleton, ratifier, hash helper,
/// four mock tokens, four fixed-price oracles, and four markets. Writes
/// deployments/base-sepolia.json with everything the frontend needs to reconstruct
/// each Market struct byte-for-byte.
contract Deploy is Script {
    struct MarketMeta {
        bytes32 id;
        MockERC20 loanToken;
        MockERC20 collateralToken;
        uint256 lltv;
        uint256 rcfThreshold;
        MockOracle oracle;
    }

    uint256 constant LIQUIDATION_CURSOR = 0.3e18;

    Midnight midnight;
    EcrecoverRatifier ratifier;
    HashHelper helper;
    MockERC20 mUSDC;
    MockERC20 mDAI;
    MockERC20 mWETH;
    MockERC20 mWBTC;
    MarketMeta[4] metas;
    uint256 maturity;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        midnight = new Midnight(); // deployer becomes configurator
        ratifier = new EcrecoverRatifier(address(midnight));
        helper = new HashHelper();

        mUSDC = new MockERC20("Mock USDC", "mUSDC", 6);
        mDAI = new MockERC20("Mock DAI", "mDAI", 18);
        mWETH = new MockERC20("Mock WETH", "mWETH", 18);
        mWBTC = new MockERC20("Mock WBTC", "mWBTC", 8);

        // price = humanPrice * 10^(36 + loanDecimals - collateralDecimals)
        MockOracle oracleWethUsdc = new MockOracle(2_500e24);
        MockOracle oracleWbtcUsdc = new MockOracle(60_000e34);
        MockOracle oracleWethDai = new MockOracle(2_500e36);
        MockOracle oracleWbtcDai = new MockOracle(60_000e46);

        midnight.enableLltv(0.77e18);
        midnight.enableLltv(0.86e18);
        midnight.enableLiquidationCursor(LIQUIDATION_CURSOR);

        maturity = block.timestamp + 30 days;

        metas[0] = MarketMeta(bytes32(0), mUSDC, mWETH, 0.86e18, 10e6, oracleWethUsdc);
        metas[1] = MarketMeta(bytes32(0), mUSDC, mWBTC, 0.77e18, 10e6, oracleWbtcUsdc);
        metas[2] = MarketMeta(bytes32(0), mDAI, mWETH, 0.86e18, 10e18, oracleWethDai);
        metas[3] = MarketMeta(bytes32(0), mDAI, mWBTC, 0.77e18, 10e18, oracleWbtcDai);

        for (uint256 i = 0; i < 4; i++) {
            metas[i].id = midnight.touchMarket(_buildMarket(metas[i]));
        }

        vm.stopBroadcast();

        _writeDeploymentsJson();
    }

    function _buildMarket(MarketMeta memory meta) internal view returns (Market memory) {
        CollateralParams[] memory cps = new CollateralParams[](1);
        cps[0] = CollateralParams({
            token: address(meta.collateralToken),
            lltv: meta.lltv,
            liquidationCursor: LIQUIDATION_CURSOR,
            oracle: address(meta.oracle)
        });
        return Market({
            chainId: block.chainid,
            midnight: address(midnight),
            loanToken: address(meta.loanToken),
            collateralParams: cps,
            maturity: maturity,
            rcfThreshold: meta.rcfThreshold,
            enterGate: address(0),
            liquidatorGate: address(0)
        });
    }

    function _tokenJson(MockERC20 token) internal view returns (string memory) {
        return string.concat(
            '{"address":"',
            vm.toString(address(token)),
            '","symbol":"',
            token.symbol(),
            '","name":"',
            token.name(),
            '","decimals":',
            vm.toString(uint256(token.decimals())),
            "}"
        );
    }

    function _marketJson(MarketMeta memory meta) internal view returns (string memory) {
        string memory part = string.concat(
            '{"id":"',
            vm.toString(meta.id),
            '","chainId":',
            vm.toString(block.chainid),
            ',"midnight":"',
            vm.toString(address(midnight)),
            '","loanToken":"',
            vm.toString(address(meta.loanToken)),
            '","loanSymbol":"',
            meta.loanToken.symbol(),
            '","loanDecimals":',
            vm.toString(uint256(meta.loanToken.decimals()))
        );
        part = string.concat(
            part,
            ',"collateralToken":"',
            vm.toString(address(meta.collateralToken)),
            '","collateralSymbol":"',
            meta.collateralToken.symbol(),
            '","collateralDecimals":',
            vm.toString(uint256(meta.collateralToken.decimals())),
            ',"lltv":"',
            vm.toString(meta.lltv),
            '","liquidationCursor":"',
            vm.toString(LIQUIDATION_CURSOR)
        );
        return string.concat(
            part,
            '","oracle":"',
            vm.toString(address(meta.oracle)),
            '","rcfThreshold":"',
            vm.toString(meta.rcfThreshold),
            '","maturity":"',
            vm.toString(maturity),
            '","enterGate":"0x0000000000000000000000000000000000000000","liquidatorGate":"0x0000000000000000000000000000000000000000"}'
        );
    }

    function _writeDeploymentsJson() internal {
        string memory json = string.concat(
            '{"chainId":',
            vm.toString(block.chainid),
            ',"deployedAt":',
            vm.toString(block.timestamp),
            ',"maturity":"',
            vm.toString(maturity),
            '","midnight":"',
            vm.toString(address(midnight)),
            '","ratifier":"',
            vm.toString(address(ratifier)),
            '","hashHelper":"',
            vm.toString(address(helper)),
            '"'
        );
        json = string.concat(
            json,
            ',"tokens":{"mUSDC":',
            _tokenJson(mUSDC),
            ',"mDAI":',
            _tokenJson(mDAI),
            ',"mWETH":',
            _tokenJson(mWETH),
            ',"mWBTC":',
            _tokenJson(mWBTC),
            "}"
        );
        json = string.concat(
            json,
            ',"markets":[',
            _marketJson(metas[0]),
            ",",
            _marketJson(metas[1]),
            ",",
            _marketJson(metas[2]),
            ",",
            _marketJson(metas[3]),
            "]}"
        );
        vm.writeFile("deployments/base-sepolia.json", json);
    }
}
