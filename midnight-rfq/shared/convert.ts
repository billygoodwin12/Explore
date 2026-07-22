// Single home for BigInt <-> string conversion at the JSON boundary (spec 5.7).
import type { CollateralParamsJSON, MarketJSON, OfferJSON } from "./types";

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export interface CollateralParamsStruct {
  token: Address;
  lltv: bigint;
  liquidationCursor: bigint;
  oracle: Address;
}

export interface MarketStruct {
  chainId: bigint;
  midnight: Address;
  loanToken: Address;
  collateralParams: CollateralParamsStruct[];
  maturity: bigint;
  rcfThreshold: bigint;
  enterGate: Address;
  liquidatorGate: Address;
}

export interface OfferStruct {
  market: MarketStruct;
  buy: boolean;
  maker: Address;
  start: bigint;
  expiry: bigint;
  tick: bigint;
  group: Hex;
  callback: Address;
  callbackData: Hex;
  receiverIfMakerIsSeller: Address;
  ratifier: Address;
  reduceOnly: boolean;
  maxUnits: bigint;
  maxAssets: bigint;
  continuousFeeCap: bigint;
}

const addr = (s: string): Address => s.toLowerCase() as Address;

export function marketJsonToStruct(m: MarketJSON): MarketStruct {
  return {
    chainId: BigInt(m.chainId),
    midnight: addr(m.midnight),
    loanToken: addr(m.loanToken),
    collateralParams: m.collateralParams.map((cp) => ({
      token: addr(cp.token),
      lltv: BigInt(cp.lltv),
      liquidationCursor: BigInt(cp.liquidationCursor),
      oracle: addr(cp.oracle),
    })),
    maturity: BigInt(m.maturity),
    rcfThreshold: BigInt(m.rcfThreshold),
    enterGate: addr(m.enterGate),
    liquidatorGate: addr(m.liquidatorGate),
  };
}

export function marketStructToJson(m: MarketStruct): MarketJSON {
  return {
    chainId: m.chainId.toString(),
    midnight: addr(m.midnight),
    loanToken: addr(m.loanToken),
    collateralParams: m.collateralParams.map(
      (cp): CollateralParamsJSON => ({
        token: addr(cp.token),
        lltv: cp.lltv.toString(),
        liquidationCursor: cp.liquidationCursor.toString(),
        oracle: addr(cp.oracle),
      }),
    ),
    maturity: m.maturity.toString(),
    rcfThreshold: m.rcfThreshold.toString(),
    enterGate: addr(m.enterGate),
    liquidatorGate: addr(m.liquidatorGate),
  };
}

export function offerJsonToStruct(o: OfferJSON): OfferStruct {
  return {
    market: marketJsonToStruct(o.market),
    buy: o.buy,
    maker: addr(o.maker),
    start: BigInt(o.start),
    expiry: BigInt(o.expiry),
    tick: BigInt(o.tick),
    group: o.group.toLowerCase() as Hex,
    callback: addr(o.callback),
    callbackData: o.callbackData.toLowerCase() as Hex,
    receiverIfMakerIsSeller: addr(o.receiverIfMakerIsSeller),
    ratifier: addr(o.ratifier),
    reduceOnly: o.reduceOnly,
    maxUnits: BigInt(o.maxUnits),
    maxAssets: BigInt(o.maxAssets),
    continuousFeeCap: BigInt(o.continuousFeeCap),
  };
}

export function offerStructToJson(o: OfferStruct): OfferJSON {
  return {
    market: marketStructToJson(o.market),
    buy: o.buy,
    maker: addr(o.maker),
    start: o.start.toString(),
    expiry: o.expiry.toString(),
    tick: o.tick.toString(),
    group: o.group.toLowerCase(),
    callback: addr(o.callback),
    callbackData: o.callbackData.toLowerCase(),
    receiverIfMakerIsSeller: addr(o.receiverIfMakerIsSeller),
    ratifier: addr(o.ratifier),
    reduceOnly: o.reduceOnly,
    maxUnits: o.maxUnits.toString(),
    maxAssets: o.maxAssets.toString(),
    continuousFeeCap: o.continuousFeeCap.toString(),
  };
}
