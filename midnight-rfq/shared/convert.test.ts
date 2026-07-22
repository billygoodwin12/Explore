import { describe, expect, it } from "vitest";
import { offerJsonToStruct, offerStructToJson, type OfferStruct } from "./convert";
import { encodeRatifierData, localDigest, splitSignature } from "./eip712";
import type { OfferJSON } from "./types";

const sampleOffer: OfferJSON = {
  market: {
    chainId: "84532",
    midnight: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
    loanToken: "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9",
    collateralParams: [
      {
        token: "0x5fc8d32690cc91d4c39d9d3abcbd16989f875707",
        lltv: "860000000000000000",
        liquidationCursor: "300000000000000000",
        oracle: "0xa513e6e4b8f2a923d98304ec87f64353c4d5c853",
      },
    ],
    maturity: "1787281367",
    rcfThreshold: "10000000",
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  buy: true,
  maker: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  start: "1784689000",
  expiry: "1785293800",
  tick: "5240",
  group: "0x" + "11".repeat(32),
  callback: "0x0000000000000000000000000000000000000000",
  callbackData: "0x",
  receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
  ratifier: "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
  reduceOnly: false,
  maxUnits: "10000000000",
  maxAssets: "0",
  continuousFeeCap: "1000000000000000000",
};

describe("offerJsonToStruct round-trip", () => {
  it("round-trips json -> struct -> json unchanged", () => {
    const struct = offerJsonToStruct(sampleOffer);
    const back = offerStructToJson(struct);
    expect(back).toEqual(sampleOffer);
  });

  it("round-trips struct -> json -> struct unchanged", () => {
    const struct = offerJsonToStruct(sampleOffer);
    const again = offerJsonToStruct(offerStructToJson(struct));
    expect(again).toEqual(struct);
  });

  it("converts all numerics to bigint", () => {
    const s: OfferStruct = offerJsonToStruct(sampleOffer);
    expect(typeof s.start).toBe("bigint");
    expect(typeof s.market.chainId).toBe("bigint");
    expect(typeof s.market.collateralParams[0].lltv).toBe("bigint");
    expect(s.maxUnits).toBe(10000000000n);
  });
});

describe("eip712 helpers", () => {
  it("computes a deterministic local digest", () => {
    const s = offerJsonToStruct(sampleOffer);
    const d1 = localDigest(s, s.ratifier, 84532);
    const d2 = localDigest(s, s.ratifier, 84532);
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^0x[0-9a-f]{64}$/);
    // Different chainId -> different domain -> different digest.
    expect(localDigest(s, s.ratifier, 1)).not.toBe(d1);
  });

  it("splitSignature normalizes v to 27/28", () => {
    const sig = ("0x" + "aa".repeat(32) + "bb".repeat(32) + "00") as `0x${string}`;
    expect(splitSignature(sig).v).toBe(27);
    const sig2 = ("0x" + "aa".repeat(32) + "bb".repeat(32) + "1c") as `0x${string}`;
    expect(splitSignature(sig2).v).toBe(28);
  });

  it("encodes ratifierData as (Signature struct, root, leafIndex, proof)", () => {
    const data = encodeRatifierData({ v: 27, r: ("0x" + "aa".repeat(32)) as `0x${string}`, s: ("0x" + "bb".repeat(32)) as `0x${string}` }, ("0x" + "cc".repeat(32)) as `0x${string}`);
    // head: v (32) + r (32) + s (32) + root (32) + leafIndex (32) + proof offset (32) + proof length (32)
    expect(data.length).toBe(2 + 64 * 7);
    expect(data.slice(2, 66)).toBe("1b".padStart(64, "0")); // v = 27, left-padded
  });
});
