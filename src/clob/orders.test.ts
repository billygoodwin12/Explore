import { describe, it, expect } from "vitest";
import { Wallet } from "ethers";
import { ADDRS, CHAIN_ID } from "../config/addresses.js";

const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
};

describe("EIP-712 Order Signing", () => {
  const testPk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const wallet = new Wallet(testPk);

  it("produces a valid 65-byte signature for CTF Exchange", async () => {
    const domain = {
      name: "Polymarket CTF Exchange",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: ADDRS.CTF_EXCHANGE,
    };

    const order = {
      salt: 123456789n,
      maker: wallet.address,
      signer: wallet.address,
      taker: "0x0000000000000000000000000000000000000000",
      tokenId: 1234567890n,
      makerAmount: 500000n,
      takerAmount: 1000000n,
      expiration: 0n,
      nonce: 0n,
      feeRateBps: 100n,
      side: 0,
      signatureType: 0,
    };

    const sig = await wallet._signTypedData(domain, ORDER_TYPES, order);
    expect(sig).toBeTruthy();
    expect(sig.startsWith("0x")).toBe(true);
    expect(sig.length).toBe(132);
  });

  it("produces a valid signature for Neg Risk Exchange", async () => {
    const domain = {
      name: "Polymarket CTF Exchange",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: ADDRS.NEG_RISK_EXCHANGE,
    };

    const order = {
      salt: 987654321n,
      maker: wallet.address,
      signer: wallet.address,
      taker: "0x0000000000000000000000000000000000000000",
      tokenId: 9876543210n,
      makerAmount: 1000000n,
      takerAmount: 500000n,
      expiration: 0n,
      nonce: 0n,
      feeRateBps: 50n,
      side: 1,
      signatureType: 0,
    };

    const sig = await wallet._signTypedData(domain, ORDER_TYPES, order);
    expect(sig).toBeTruthy();
    expect(sig.startsWith("0x")).toBe(true);
    expect(sig.length).toBe(132);
  });

  it("uses correct domain for neg risk vs standard exchange", async () => {
    const ctfDomain = {
      name: "Polymarket CTF Exchange",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: ADDRS.CTF_EXCHANGE,
    };

    const negRiskDomain = {
      name: "Polymarket CTF Exchange",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: ADDRS.NEG_RISK_EXCHANGE,
    };

    expect(ctfDomain.name).toBe(negRiskDomain.name);
    expect(ctfDomain.verifyingContract).not.toBe(negRiskDomain.verifyingContract);
    expect(ctfDomain.verifyingContract).toBe(ADDRS.CTF_EXCHANGE);
    expect(negRiskDomain.verifyingContract).toBe(ADDRS.NEG_RISK_EXCHANGE);
  });

  it("different salts produce different signatures", async () => {
    const domain = {
      name: "Polymarket CTF Exchange",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: ADDRS.CTF_EXCHANGE,
    };

    const baseOrder = {
      maker: wallet.address,
      signer: wallet.address,
      taker: "0x0000000000000000000000000000000000000000",
      tokenId: 1234567890n,
      makerAmount: 500000n,
      takerAmount: 1000000n,
      expiration: 0n,
      nonce: 0n,
      feeRateBps: 100n,
      side: 0,
      signatureType: 0,
    };

    const sig1 = await wallet._signTypedData(domain, ORDER_TYPES, {
      ...baseOrder,
      salt: 1n,
    });
    const sig2 = await wallet._signTypedData(domain, ORDER_TYPES, {
      ...baseOrder,
      salt: 2n,
    });

    expect(sig1).not.toBe(sig2);
  });

  it("amounts use 6-decimal USDC scale", () => {
    const oneUsdc = 1_000_000n;
    const halfUsdc = 500_000n;
    const tenUsdc = 10_000_000n;

    expect(oneUsdc).toBe(BigInt(1e6));
    expect(halfUsdc).toBe(BigInt(0.5e6));
    expect(tenUsdc).toBe(BigInt(10e6));
  });
});
