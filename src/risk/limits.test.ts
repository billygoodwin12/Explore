import { describe, it, expect, vi, beforeEach } from "vitest";
import { canPlace, computeTotalAtRisk } from "./limits.js";
import type { Portfolio, OrderCandidate } from "./limits.js";
import type { InventoryState } from "../strategy/inventory.js";

vi.mock("../config/env.js", () => ({
  getEnv: () => ({
    MAX_CAPITAL_USDC: 5000,
  }),
}));

describe("Risk Limits", () => {
  const emptyPortfolio: Portfolio = {
    totalEquityUsdc: 5000,
    totalAtRiskUsdc: 0,
    inventories: new Map(),
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
      totalAtRiskUsdc: 3400,
      inventories: new Map(),
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

  it("rejects order exceeding per-market cap (30%)", () => {
    const inv: InventoryState = {
      conditionId: "market1",
      yesShares: 0,
      noShares: 0,
      netDeltaUsdc: 0,
      capitalDeployed: 1400,
    };
    const portfolio: Portfolio = {
      totalEquityUsdc: 5000,
      totalAtRiskUsdc: 1400,
      inventories: new Map([["market1", inv]]),
    };
    const order: OrderCandidate = {
      conditionId: "market1",
      side: "BUY",
      sizeUsdc: 200,
    };
    const result = canPlace(order, portfolio);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Per-market cap");
  });

  it("rejects when no equity", () => {
    const portfolio: Portfolio = {
      totalEquityUsdc: 0,
      totalAtRiskUsdc: 0,
      inventories: new Map(),
    };
    const result = canPlace(
      { conditionId: "m", side: "BUY", sizeUsdc: 1 },
      portfolio,
    );
    expect(result.allowed).toBe(false);
  });

  it("computeTotalAtRisk sums all inventories", () => {
    const invs = new Map<string, InventoryState>([
      ["m1", { conditionId: "m1", yesShares: 0, noShares: 0, netDeltaUsdc: 0, capitalDeployed: 500 }],
      ["m2", { conditionId: "m2", yesShares: 0, noShares: 0, netDeltaUsdc: 0, capitalDeployed: 300 }],
    ]);
    expect(computeTotalAtRisk(invs)).toBe(800);
  });
});
