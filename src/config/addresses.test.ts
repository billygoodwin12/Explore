import { describe, it, expect } from "vitest";
import { ADDRS, CHAIN_ID } from "./addresses.js";

describe("Contract Addresses", () => {
  it("all addresses are valid checksummed Ethereum addresses", () => {
    const addressRegex = /^0x[0-9a-fA-F]{40}$/;
    for (const [name, addr] of Object.entries(ADDRS)) {
      expect(addr).toMatch(addressRegex);
    }
  });

  it("chain ID is Polygon mainnet (137)", () => {
    expect(CHAIN_ID).toBe(137);
  });

  it("CTF Exchange matches known address", () => {
    expect(ADDRS.CTF_EXCHANGE).toBe("0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E");
  });

  it("Neg Risk Exchange matches known address", () => {
    expect(ADDRS.NEG_RISK_EXCHANGE).toBe("0xC5d563A36AE78145C45a50134d48A1215220f80a");
  });

  it("USDC.e matches known address", () => {
    expect(ADDRS.USDCE).toBe("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174");
  });

  it("CTF token matches known address", () => {
    expect(ADDRS.CTF).toBe("0x4D97DCd97eC945f40cF65F87097ACe5EA0476045");
  });

  it("Neg Risk Adapter matches known address", () => {
    expect(ADDRS.NEG_RISK_ADAPTER).toBe("0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296");
  });
});
