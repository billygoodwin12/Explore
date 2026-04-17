import { describe, it, expect } from "vitest";
import {
  canAcceptInventory,
  inventoryRoom,
  checkGlobalCap,
  computeNetDelta,
} from "./inventory.js";
import type { InventoryState } from "./inventory.js";

describe("Inventory Management", () => {
  const baseState: InventoryState = {
    conditionId: "test",
    yesShares: 100,
    noShares: 50,
    netDeltaUsdc: 25,
    capitalDeployed: 300,
  };

  describe("canAcceptInventory", () => {
    it("allows within cap", () => {
      expect(canAcceptInventory("YES", 50, baseState, 1000)).toBe(true);
    });

    it("rejects exceeding per-market cap (30%)", () => {
      expect(canAcceptInventory("YES", 300, baseState, 1000)).toBe(false);
    });
  });

  describe("inventoryRoom", () => {
    it("returns remaining room on YES side", () => {
      const room = inventoryRoom("YES", baseState, 1000);
      expect(room).toBe(200);
    });

    it("returns remaining room on NO side", () => {
      const room = inventoryRoom("NO", baseState, 1000);
      expect(room).toBe(250);
    });

    it("returns 0 when at cap", () => {
      const atCap = { ...baseState, yesShares: 300 };
      expect(inventoryRoom("YES", atCap, 1000)).toBe(0);
    });
  });

  describe("checkGlobalCap", () => {
    it("passes when below 70%", () => {
      expect(checkGlobalCap(3000, 5000)).toBe(true);
    });

    it("fails when above 70%", () => {
      expect(checkGlobalCap(3600, 5000)).toBe(false);
    });
  });

  describe("computeNetDelta", () => {
    it("positive when long YES", () => {
      expect(computeNetDelta(100, 50, 0.50)).toBe(25);
    });

    it("negative when long NO", () => {
      expect(computeNetDelta(50, 100, 0.50)).toBe(-25);
    });

    it("zero when balanced", () => {
      expect(computeNetDelta(100, 100, 0.50)).toBe(0);
    });
  });
});
