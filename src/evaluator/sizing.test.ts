import { describe, it, expect, vi } from "vitest";
import { computeCopySize } from "./sizing.js";

vi.mock("../config/index.js", () => ({
  getEnv: () => ({
    MIN_STAKE_USDC: 7,
    MAX_STAKE_USDC: 300,
  }),
}));

describe("computeCopySize", () => {
  it("sizes proportionally to whale deployment", () => {
    const result = computeCopySize({
      whaleTradeUsdc: 1000,
      whaleBalanceUsdc: 100_000,
      ourBalanceUsdc: 1000,
      sizingMultiplier: 1.0,
    });
    expect(result.skipped).toBe(false);
    expect(result.sizeUsdc).toBeCloseTo(10, 5);
  });

  it("applies sizing multiplier", () => {
    const result = computeCopySize({
      whaleTradeUsdc: 1000,
      whaleBalanceUsdc: 100_000,
      ourBalanceUsdc: 1000,
      sizingMultiplier: 2.0,
    });
    expect(result.sizeUsdc).toBeCloseTo(20, 5);
  });

  it("skips below minimum stake", () => {
    const result = computeCopySize({
      whaleTradeUsdc: 100,
      whaleBalanceUsdc: 1_000_000,
      ourBalanceUsdc: 1000,
      sizingMultiplier: 1.0,
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("BELOW_MIN_STAKE");
  });

  it("caps at maximum stake", () => {
    const result = computeCopySize({
      whaleTradeUsdc: 100_000,
      whaleBalanceUsdc: 200_000,
      ourBalanceUsdc: 10_000,
      sizingMultiplier: 1.0,
    });
    expect(result.sizeUsdc).toBe(300);
  });

  it("skips if whale balance unknown", () => {
    const result = computeCopySize({
      whaleTradeUsdc: 1000,
      whaleBalanceUsdc: 0,
      ourBalanceUsdc: 1000,
      sizingMultiplier: 1.0,
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("UNKNOWN_WHALE_BALANCE");
  });

  it("skips if we have no balance", () => {
    const result = computeCopySize({
      whaleTradeUsdc: 1000,
      whaleBalanceUsdc: 100_000,
      ourBalanceUsdc: 0,
      sizingMultiplier: 1.0,
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("NO_BALANCE");
  });
});
