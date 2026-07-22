// Contract-facing helpers used across tabs.
import type { Address, Hex, MarketStruct, OfferStruct } from "@shared/convert";
import { marketJsonToStruct } from "@shared/convert";
import { ADDRESSES, type MarketInfo } from "@shared/deployments";
import type { MarketInfo as MI } from "@shared/deployments";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
export const ORACLE_PRICE_SCALE = 10n ** 36n;
export const WAD = 10n ** 18n;

export function marketStructOf(info: MarketInfo): MarketStruct {
  return marketJsonToStruct(info.market);
}

export function randomGroup(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return ("0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")) as Hex;
}

/// buyerAssets = units * price / 1e18 (round down for buy offers, up for sell offers — fee = 0)
export function assetsForUnits(units: bigint, priceWad: bigint, buy: boolean): bigint {
  return buy ? (units * priceWad) / WAD : (units * priceWad + WAD - 1n) / WAD;
}

/// maxDebt = collateral * oraclePrice / 1e36 * lltv / 1e18
export function maxDebtOf(collateral: bigint, oraclePrice: bigint, lltv: bigint): bigint {
  return (((collateral * oraclePrice) / ORACLE_PRICE_SCALE) * lltv) / WAD;
}

/// collateralNeeded = (debt + units) * 1e36 / (oraclePrice * lltv / 1e18) * hf
/// hf as percent (125 -> health factor 1.25).
export function collateralForDebt(totalDebt: bigint, oraclePrice: bigint, lltv: bigint, hfPercent = 125n): bigint {
  if (oraclePrice === 0n) return 0n;
  return (((totalDebt * ORACLE_PRICE_SCALE) / ((oraclePrice * lltv) / WAD)) * hfPercent) / 100n;
}

export function buildOffer(params: {
  info: MI;
  buy: boolean;
  maker: Address;
  tick: bigint;
  maxUnits: bigint;
  expiry: bigint;
  nowSeconds: number;
}): OfferStruct {
  const { info, buy, maker, tick, maxUnits, expiry, nowSeconds } = params;
  return {
    market: marketStructOf(info),
    buy,
    maker,
    start: BigInt(nowSeconds - 300), // clock-skew guard
    expiry,
    tick,
    group: randomGroup(),
    callback: ZERO_ADDRESS,
    callbackData: "0x",
    receiverIfMakerIsSeller: buy ? ZERO_ADDRESS : maker,
    ratifier: ADDRESSES.ratifier as Address,
    reduceOnly: false,
    maxUnits,
    maxAssets: 0n,
    continuousFeeCap: 10n ** 18n,
  };
}
