import { describe, expect, it } from "vitest";
import { offerJsonToStruct } from "./convert";
import { DigestMismatchError, assertDigestParity } from "./digest";
import { localDigest } from "./eip712";
import type { OfferJSON } from "./types";

const offer: OfferJSON = {
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
  group: "0x" + "22".repeat(32),
  callback: "0x0000000000000000000000000000000000000000",
  callbackData: "0x",
  receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
  ratifier: "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
  reduceOnly: false,
  maxUnits: "10000000000",
  maxAssets: "0",
  continuousFeeCap: "1000000000000000000",
};

describe("assertDigestParity", () => {
  it("returns the digest when local and on-chain agree", async () => {
    const s = offerJsonToStruct(offer);
    const expected = localDigest(s, s.ratifier, 84532);
    const got = await assertDigestParity(s, s.ratifier, 84532, async () => expected);
    expect(got).toBe(expected);
  });

  it("throws DigestMismatchError on disagreement", async () => {
    const s = offerJsonToStruct(offer);
    await expect(
      assertDigestParity(s, s.ratifier, 84532, async () => ("0x" + "00".repeat(32)) as `0x${string}`),
    ).rejects.toThrow(DigestMismatchError);
  });
});
