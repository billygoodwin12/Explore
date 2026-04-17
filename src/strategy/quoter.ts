import type { ClobAdapter, OrderBook } from "../clob/adapter.js";
import type { OrderParams } from "../clob/orders.js";
import { ORDER_SIDE } from "../clob/orders.js";
import { inventoryRoom, loadInventory, saveInventory, computeNetDelta } from "./inventory.js";
import { computeRewardScore } from "./rewards.js";
import { getAppState, getRedis, REDIS_CHANNELS } from "../persist/redis.js";
import { logger } from "../logger.js";

export interface QuoterConfig {
  gamma: number;
  sigma: number;
  tau: number;
  maxCapitalPerMarket: number;
  tickSize: number;
}

const DEFAULT_CONFIG: QuoterConfig = {
  gamma: 0.1,
  sigma: 0.05,
  tau: 1,
  maxCapitalPerMarket: 1000,
  tickSize: 0.01,
};

export interface MarketQuoteTarget {
  conditionId: string;
  tokenId: string;
  negRisk: boolean;
  maxIncentiveSpreadBps: number;
  minIncentiveSize: number;
  dailyRate: number;
  plannedSpread: number;
}

interface QuoteDecision {
  bid: number | null;
  ask: number | null;
  bidSize: number;
  askSize: number;
  reasonCode: string;
}

export function computeMicropriceMid(book: OrderBook): number {
  if (book.bids.length === 0 || book.asks.length === 0) return 0.5;
  const bestBid = book.bids[0]!;
  const bestAsk = book.asks[0]!;
  return (
    (bestBid.price * bestAsk.size + bestAsk.price * bestBid.size) /
    (bestBid.size + bestAsk.size)
  );
}

function roundToTick(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

function clampPrice(price: number): number {
  return Math.max(0.01, Math.min(0.99, price));
}

export async function computeQuote(
  target: MarketQuoteTarget,
  book: OrderBook,
  config: QuoterConfig = DEFAULT_CONFIG,
): Promise<QuoteDecision> {
  const appState = await getAppState();
  if (appState.halted) {
    return { bid: null, ask: null, bidSize: 0, askSize: 0, reasonCode: "HALTED" };
  }

  const mid = computeMicropriceMid(book);
  if (mid <= 0 || mid >= 1) {
    return { bid: null, ask: null, bidSize: 0, askSize: 0, reasonCode: "INVALID_MID" };
  }

  const inventory = await loadInventory(target.conditionId);
  const q = inventory.yesShares - inventory.noShares;

  const skewedMid = mid - config.gamma * config.sigma * config.sigma * config.tau * q;

  const halfSpread = target.plannedSpread / 2;
  const maxSpread = (target.maxIncentiveSpreadBps / 10000) * 0.6;

  const effectiveHalfSpread = Math.min(halfSpread, maxSpread / 2);

  let bidPrice = roundToTick(skewedMid - effectiveHalfSpread, config.tickSize);
  let askPrice = roundToTick(skewedMid + effectiveHalfSpread, config.tickSize);

  bidPrice = clampPrice(bidPrice);
  askPrice = clampPrice(askPrice);

  if (bidPrice >= askPrice) {
    return { bid: null, ask: null, bidSize: 0, askSize: 0, reasonCode: "CROSSED" };
  }

  if (mid < 0.10 || mid > 0.90) {
    const bidRoom = inventoryRoom("YES", inventory, config.maxCapitalPerMarket);
    const askRoom = inventoryRoom("NO", inventory, config.maxCapitalPerMarket);
    if (bidRoom <= 0 || askRoom <= 0) {
      return { bid: null, ask: null, bidSize: 0, askSize: 0, reasonCode: "EXTREME_MID_NO_ROOM" };
    }
  }

  const baseSize = target.minIncentiveSize * 1.25;
  const bidRoom = inventoryRoom("YES", inventory, config.maxCapitalPerMarket);
  const askRoom = inventoryRoom("NO", inventory, config.maxCapitalPerMarket);

  const bidSize = Math.min(baseSize, bidRoom);
  const askSize = Math.min(baseSize, askRoom);

  if (bidSize <= 0 && askSize <= 0) {
    return { bid: null, ask: null, bidSize: 0, askSize: 0, reasonCode: "NO_ROOM" };
  }

  return {
    bid: bidSize > 0 ? bidPrice : null,
    ask: askSize > 0 ? askPrice : null,
    bidSize,
    askSize,
    reasonCode: "OK",
  };
}

export interface ActiveQuote {
  orderId: string;
  price: number;
  size: number;
  side: 0 | 1;
}

export function shouldReplaceQuote(
  current: ActiveQuote | null,
  targetPrice: number | null,
  targetSize: number,
  tickSize: number,
): boolean {
  if (!current && targetPrice !== null) return true;
  if (current && targetPrice === null) return true;
  if (!current || targetPrice === null) return false;

  const priceDiff = Math.abs(current.price - targetPrice);
  if (priceDiff >= tickSize) return true;

  const sizeDiff = Math.abs(current.size - targetSize) / current.size;
  if (sizeDiff > 0.10) return true;

  return false;
}

export async function executeQuoteCycle(
  target: MarketQuoteTarget,
  adapter: ClobAdapter,
  currentBid: ActiveQuote | null,
  currentAsk: ActiveQuote | null,
  config: QuoterConfig = DEFAULT_CONFIG,
): Promise<{
  newBid: ActiveQuote | null;
  newAsk: ActiveQuote | null;
  decision: QuoteDecision;
}> {
  const book = await adapter.getOrderBook(target.tokenId);
  const decision = await computeQuote(target, book, config);

  let newBid = currentBid;
  let newAsk = currentAsk;

  if (shouldReplaceQuote(currentBid, decision.bid, decision.bidSize, config.tickSize)) {
    if (currentBid) {
      await adapter.cancel(currentBid.orderId);
      newBid = null;
    }
    if (decision.bid !== null && decision.bidSize > 0) {
      const result = await adapter.signAndPlace({
        tokenId: target.tokenId,
        price: decision.bid,
        size: decision.bidSize,
        side: ORDER_SIDE.BUY,
        negRisk: target.negRisk,
      });
      newBid = {
        orderId: result.clobOrderId,
        price: decision.bid,
        size: decision.bidSize,
        side: ORDER_SIDE.BUY,
      };
    }
  }

  if (shouldReplaceQuote(currentAsk, decision.ask, decision.askSize, config.tickSize)) {
    if (currentAsk) {
      await adapter.cancel(currentAsk.orderId);
      newAsk = null;
    }
    if (decision.ask !== null && decision.askSize > 0) {
      const result = await adapter.signAndPlace({
        tokenId: target.tokenId,
        price: decision.ask,
        size: decision.askSize,
        side: ORDER_SIDE.SELL,
        negRisk: target.negRisk,
      });
      newAsk = {
        orderId: result.clobOrderId,
        price: decision.ask,
        size: decision.askSize,
        side: ORDER_SIDE.SELL,
      };
    }
  }

  const redis = getRedis();
  await redis.publish(
    REDIS_CHANNELS.QUOTES,
    JSON.stringify({
      conditionId: target.conditionId,
      decision,
      bid: newBid,
      ask: newAsk,
      timestamp: Date.now(),
    }),
  );

  return { newBid, newAsk, decision };
}
