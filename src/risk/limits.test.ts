import { describe, it, expect, vi } from "vitest";
import { canPlace } from "./limits.js";
import type { Portfolio, OrderCandidate } from "./limits.js";

vi.mock("../config/env.js", () => ({
  getEnv: () => ({
    MAX_CAPITAL_USDC: 5000,
    MAX_CAPITAL_AT_RISK_PCT: 70,
    MAX_BUYS_PER_TOKEN: 3,
  }),
}));

describe("Risk Limits", () => {
  const emptyPortfolio: Portfolio = {
    totalEquityUsdc: 5000,
    totalDeployedUsdc: 0,
    openPositionsByMarket: new Map(),
  };

  it("allows order within caps", () => {
    const order: OrderCandidate = {
      conditionId: "market1",
      side: "BUY",
      sizeUsdc: 100,
    };
    const result = canPlace(order, emptyPortfolio);
    expect(result.allowed).toBe(true);
  });

  it("rejects order exceeding global cap (70%)", () => {
    const portfolio: Portfolio = {
      totalEquityUsdc: 5000,
      totalDeployedUsdc: 3400,
      openPositionsByMarket: new Map(),
    };
    const order: OrderCandidate = {
      conditionId: "market1",
      side: "BUY",
      sizeUsdc: 200,
    };
    const result = canPlace(order, portfolio);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Global cap");
  });

  it("rejects when per-market limit reached", () => {
    const portfolio: Portfolio = {
      totalEquityUsdc: 5000,
      totalDeployedUsdc: 0,
      openPositionsByMarket: new Map([["m1", 3]]),
    };
    const result = canPlace(
      { conditionId: "m1", side: "BUY", sizeUsdc: 100 },
      portfolio,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Per-market cap");
  });

  it("rejects when no equity", () => {
    const portfolio: Portfolio = {
      totalEquityUsdc: 0,
      totalDeployedUsdc: 0,
      openPositionsByMarket: new Map(),
    };
    const result = canPlace(
      { conditionId: "m", side: "BUY", sizeUsdc: 1 },
      portfolio,
    );
    expect(result.allowed).toBe(false);
  });
});
