import { describe, it, expect } from "vitest";
import {
  computeQScore,
  computeSpreadPenalty,
  computeRewardScore,
  estimateDailyReward,
  expectedRewardPerUsd,
} from "./rewards.js";

describe("Reward Formula", () => {
  describe("computeQScore (two-sided bonus)", () => {
    it("returns max(min(Q1,Q2), max(Q1/c, Q2/c)) with c=2", () => {
      const score = computeQScore(100, 200, 50);
      const c = 2;
      const expected = Math.max(
        Math.min(100, 200),
        Math.max(100 / c, 200 / c),
      );
      expect(score).toBe(expected);
      expect(score).toBe(100);
    });

    it("symmetric sizes yield highest score", () => {
      const symmetric = computeQScore(100, 100, 50);
      const asymmetric = computeQScore(50, 150, 50);
      expect(symmetric).toBeGreaterThanOrEqual(asymmetric);
    });

    it("zero sizes yield zero score", () => {
      expect(computeQScore(0, 0, 50)).toBe(0);
    });

    it("one-sided quoting still gets partial score", () => {
      const score = computeQScore(100, 0, 50);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("computeSpreadPenalty (quadratic)", () => {
    it("returns 1 at zero spread", () => {
      expect(computeSpreadPenalty(0, 200)).toBe(1);
    });

    it("returns 0 at max spread", () => {
      expect(computeSpreadPenalty(200, 200)).toBe(0);
    });

    it("returns 0 when spread exceeds max", () => {
      expect(computeSpreadPenalty(300, 200)).toBe(0);
    });

    it("quadratic decay: half spread gives 0.75", () => {
      const penalty = computeSpreadPenalty(100, 200);
      expect(penalty).toBeCloseTo(0.75, 5);
    });

    it("tighter spread is always better", () => {
      const tight = computeSpreadPenalty(50, 200);
      const wide = computeSpreadPenalty(150, 200);
      expect(tight).toBeGreaterThan(wide);
    });
  });

  describe("computeRewardScore", () => {
    it("returns 0 when spread exceeds max incentive", () => {
      const score = computeRewardScore({
        quoteSize: 100,
        spreadBps: 300,
        maxIncentiveSpreadBps: 200,
        minIncentiveSize: 50,
        bidSize: 100,
        askSize: 100,
        dailyRate: 1000,
      });
      expect(score).toBe(0);
    });

    it("returns positive score for valid parameters", () => {
      const score = computeRewardScore({
        quoteSize: 100,
        spreadBps: 100,
        maxIncentiveSpreadBps: 200,
        minIncentiveSize: 50,
        bidSize: 100,
        askSize: 100,
        dailyRate: 1000,
      });
      expect(score).toBeGreaterThan(0);
    });

    it("returns 0 when both sides below min size", () => {
      const score = computeRewardScore({
        quoteSize: 100,
        spreadBps: 100,
        maxIncentiveSpreadBps: 200,
        minIncentiveSize: 200,
        bidSize: 10,
        askSize: 10,
        dailyRate: 1000,
      });
      expect(score).toBe(0);
    });

    it("tighter spread yields higher score", () => {
      const params = {
        quoteSize: 100,
        maxIncentiveSpreadBps: 200,
        minIncentiveSize: 50,
        bidSize: 100,
        askSize: 100,
        dailyRate: 1000,
      };

      const tight = computeRewardScore({ ...params, spreadBps: 50 });
      const wide = computeRewardScore({ ...params, spreadBps: 150 });
      expect(tight).toBeGreaterThan(wide);
    });
  });

  describe("estimateDailyReward", () => {
    it("proportional share of pool", () => {
      const reward = estimateDailyReward(100, 1000, 500);
      expect(reward).toBe(50);
    });

    it("returns 0 for zero total score", () => {
      expect(estimateDailyReward(100, 0, 500)).toBe(0);
    });

    it("full pool for solo participant", () => {
      const reward = estimateDailyReward(100, 100, 500);
      expect(reward).toBe(500);
    });
  });

  describe("expectedRewardPerUsd", () => {
    it("returns 0 for zero capital", () => {
      const result = expectedRewardPerUsd(
        {
          quoteSize: 100,
          spreadBps: 100,
          maxIncentiveSpreadBps: 200,
          minIncentiveSize: 50,
          bidSize: 100,
          askSize: 100,
          dailyRate: 1000,
        },
        1000,
        0,
      );
      expect(result).toBe(0);
    });

    it("returns positive for valid setup", () => {
      const result = expectedRewardPerUsd(
        {
          quoteSize: 100,
          spreadBps: 100,
          maxIncentiveSpreadBps: 200,
          minIncentiveSize: 50,
          bidSize: 100,
          askSize: 100,
          dailyRate: 1000,
        },
        1000,
        200,
      );
      expect(result).toBeGreaterThan(0);
    });
  });
});
