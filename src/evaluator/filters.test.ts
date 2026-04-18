import { describe, it, expect, vi } from "vitest";
import { checkCategory, checkMarketFreshness, checkPortfolioCap } from "./filters.js";
import type { TradeSignal } from "../tracker/signal.js";

vi.mock("../config/index.js", () => ({
  getEnv: () => ({
    MAX_CAPITAL_USDC: 5000,
    MAX_CAPITAL_AT_RISK_PCT: 70,
    MARKET_FRESHNESS_HOURS: 2,
  }),
}));

function makeSignal(overrides: Partial<TradeSignal> = {}): TradeSignal {
  return {
    transactionHash: "0xabc",
    whaleAddress: "0xwhale",
    whaleUsername: null,
    timestamp: Math.floor(Date.now() / 1000),
    side: "BUY",
    conditionId: "0xcond",
    tokenId: "123",
    outcome: "Yes",
    outcomeIndex: 0,
    price: 0.5,
    size: 100,
    usdcSize: 50,
    marketSlug: "test",
    marketTitle: "Test Market",
    marketEndDate: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
    category: "politics",
    negRisk: false,
    source: "data-api",
    detectedAt: Date.now(),
    ...overrides,
  };
}

describe("Filter chain", () => {
  describe("checkCategory", () => {
    it("passes when no filter set", () => {
      const result = checkCategory({
        signal: makeSignal(),
        adapter: {} as any,
        ourBalanceUsdc: 1000,
        totalDeployedUsdc: 0,
        categoryFilter: null,
      });
      expect(result.pass).toBe(true);
    });

    it("passes when category matches", () => {
      const result = checkCategory({
        signal: makeSignal({ category: "politics" }),
        adapter: {} as any,
        ourBalanceUsdc: 1000,
        totalDeployedUsdc: 0,
        categoryFilter: ["politics", "sports"],
      });
      expect(result.pass).toBe(true);
    });

    it("rejects when category mismatch", () => {
      const result = checkCategory({
        signal: makeSignal({ category: "sports" }),
        adapter: {} as any,
        ourBalanceUsdc: 1000,
        totalDeployedUsdc: 0,
        categoryFilter: ["politics"],
      });
      expect(result.pass).toBe(false);
      if (!result.pass) expect(result.reason).toContain("CATEGORY_MISMATCH");
    });
  });

  describe("checkMarketFreshness", () => {
    it("passes for markets far from resolution", () => {
      const result = checkMarketFreshness({
        signal: makeSignal({
          marketEndDate: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
        }),
        adapter: {} as any,
        ourBalanceUsdc: 1000,
        totalDeployedUsdc: 0,
      });
      expect(result.pass).toBe(true);
    });

    it("rejects markets resolving imminently", () => {
      const result = checkMarketFreshness({
        signal: makeSignal({
          marketEndDate: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }),
        adapter: {} as any,
        ourBalanceUsdc: 1000,
        totalDeployedUsdc: 0,
      });
      expect(result.pass).toBe(false);
      if (!result.pass) expect(result.reason).toContain("MARKET_CLOSING");
    });
  });

  describe("checkPortfolioCap", () => {
    it("passes under cap", () => {
      const result = checkPortfolioCap({
        signal: makeSignal(),
        adapter: {} as any,
        ourBalanceUsdc: 5000,
        totalDeployedUsdc: 1000,
      });
      expect(result.pass).toBe(true);
    });

    it("rejects at cap", () => {
      const result = checkPortfolioCap({
        signal: makeSignal(),
        adapter: {} as any,
        ourBalanceUsdc: 5000,
        totalDeployedUsdc: 3500,
      });
      expect(result.pass).toBe(false);
      if (!result.pass) expect(result.reason).toContain("PORTFOLIO_CAP");
    });
  });
});
