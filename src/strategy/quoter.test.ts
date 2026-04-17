import { describe, it, expect } from "vitest";
import { computeMicropriceMid, shouldReplaceQuote } from "./quoter.js";
import type { OrderBook } from "../clob/adapter.js";
import type { ActiveQuote } from "./quoter.js";

describe("Quoter", () => {
  describe("computeMicropriceMid", () => {
    it("returns weighted mid for normal book", () => {
      const book: OrderBook = {
        bids: [{ price: 0.40, size: 100 }],
        asks: [{ price: 0.42, size: 100 }],
        timestamp: 0n,
      };
      const mid = computeMicropriceMid(book);
      expect(mid).toBeCloseTo(0.41, 4);
    });

    it("skews toward side with more size", () => {
      const book: OrderBook = {
        bids: [{ price: 0.40, size: 50 }],
        asks: [{ price: 0.42, size: 200 }],
        timestamp: 0n,
      };
      const mid = computeMicropriceMid(book);
      expect(mid).toBeLessThan(0.41);
    });

    it("returns 0.5 for empty book", () => {
      const book: OrderBook = { bids: [], asks: [], timestamp: 0n };
      expect(computeMicropriceMid(book)).toBe(0.5);
    });

    it("handles one-sided book (no asks)", () => {
      const book: OrderBook = {
        bids: [{ price: 0.40, size: 100 }],
        asks: [],
        timestamp: 0n,
      };
      expect(computeMicropriceMid(book)).toBe(0.5);
    });
  });

  describe("shouldReplaceQuote", () => {
    const tickSize = 0.01;

    it("returns true when no current quote and target exists", () => {
      expect(shouldReplaceQuote(null, 0.50, 100, tickSize)).toBe(true);
    });

    it("returns true when current exists but target is null", () => {
      const current: ActiveQuote = {
        orderId: "test",
        price: 0.50,
        size: 100,
        side: 0,
      };
      expect(shouldReplaceQuote(current, null, 0, tickSize)).toBe(true);
    });

    it("returns false when price within 1 tick and size within 10%", () => {
      const current: ActiveQuote = {
        orderId: "test",
        price: 0.50,
        size: 100,
        side: 0,
      };
      expect(shouldReplaceQuote(current, 0.505, 105, tickSize)).toBe(false);
    });

    it("returns true when price differs by 1 tick", () => {
      const current: ActiveQuote = {
        orderId: "test",
        price: 0.50,
        size: 100,
        side: 0,
      };
      expect(shouldReplaceQuote(current, 0.51, 100, tickSize)).toBe(true);
    });

    it("returns true when size differs by more than 10%", () => {
      const current: ActiveQuote = {
        orderId: "test",
        price: 0.50,
        size: 100,
        side: 0,
      };
      expect(shouldReplaceQuote(current, 0.50, 115, tickSize)).toBe(true);
    });
  });
});
