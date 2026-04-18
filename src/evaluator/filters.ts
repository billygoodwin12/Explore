import type { TradeSignal } from "../tracker/signal.js";
import type { ClobAdapter } from "../clob/adapter.js";
import { getEnv } from "../config/index.js";
import { getRedis, REDIS_KEYS } from "../persist/redis.js";
import { getDb } from "../persist/db.js";
import { copiedPositions } from "../persist/schema.js";
import { and, eq } from "drizzle-orm";
import { logger } from "../logger.js";

export type FilterDecision =
  | { pass: true }
  | { pass: false; reason: string };

export interface FilterContext {
  signal: TradeSignal;
  adapter: ClobAdapter;
  ourBalanceUsdc: number;
  totalDeployedUsdc: number;
  categoryFilter?: string[] | null;
}

export async function runFilterChain(ctx: FilterContext): Promise<FilterDecision> {
  const env = getEnv();

  const categoryCheck = checkCategory(ctx);
  if (!categoryCheck.pass) return categoryCheck;

  const freshnessCheck = checkMarketFreshness(ctx);
  if (!freshnessCheck.pass) return freshnessCheck;

  const sanityCheck = await checkPriceSanity(ctx);
  if (!sanityCheck.pass) return sanityCheck;

  const liquidityCheck = await checkLiquidity(ctx);
  if (!liquidityCheck.pass) return liquidityCheck;

  const positionLimitCheck = await checkPositionLimit(ctx);
  if (!positionLimitCheck.pass) return positionLimitCheck;

  const portfolioCheck = checkPortfolioCap(ctx);
  if (!portfolioCheck.pass) return portfolioCheck;

  const cooldownCheck = await checkCooldown(ctx);
  if (!cooldownCheck.pass) return cooldownCheck;

  return { pass: true };
}

export function checkCategory(ctx: FilterContext): FilterDecision {
  const allowed = ctx.categoryFilter;
  if (!allowed || allowed.length === 0) return { pass: true };
  if (allowed.includes(ctx.signal.category)) return { pass: true };
  return { pass: false, reason: `CATEGORY_MISMATCH: ${ctx.signal.category} not in ${allowed.join(",")}` };
}

export function checkMarketFreshness(ctx: FilterContext): FilterDecision {
  const env = getEnv();
  if (!ctx.signal.marketEndDate) return { pass: true };
  const endTs = new Date(ctx.signal.marketEndDate).getTime();
  const hoursUntilEnd = (endTs - Date.now()) / (1000 * 60 * 60);
  if (hoursUntilEnd < env.MARKET_FRESHNESS_HOURS) {
    return { pass: false, reason: `MARKET_CLOSING: ${hoursUntilEnd.toFixed(1)}h until resolution` };
  }
  return { pass: true };
}

export async function checkPriceSanity(ctx: FilterContext): Promise<FilterDecision> {
  try {
    const book = await ctx.adapter.getOrderBook(ctx.signal.tokenId);
    const bestPrice =
      ctx.signal.side === "BUY"
        ? book.asks[0]?.price
        : book.bids[0]?.price;

    if (bestPrice == null) return { pass: false, reason: "EMPTY_BOOK" };

    const drift = Math.abs(bestPrice - ctx.signal.price) / ctx.signal.price;
    if (drift > 0.15) {
      return { pass: false, reason: `PRICE_MOVED: ${(drift * 100).toFixed(1)}% drift` };
    }
    return { pass: true };
  } catch (err) {
    return { pass: false, reason: `BOOK_FETCH_ERROR: ${(err as Error).message}` };
  }
}

export async function checkLiquidity(ctx: FilterContext): Promise<FilterDecision> {
  const env = getEnv();

  try {
    const book = await ctx.adapter.getOrderBook(ctx.signal.tokenId);
    const levels = ctx.signal.side === "BUY" ? book.asks : book.bids;
    if (levels.length === 0) return { pass: false, reason: "NO_LIQUIDITY" };

    const targetUsdc = Math.min(env.MAX_STAKE_USDC, ctx.ourBalanceUsdc);
    let accumulatedUsdc = 0;
    let weightedPriceSum = 0;
    let accumulatedShares = 0;

    for (const level of levels) {
      const levelValueUsdc = level.price * level.size;
      const take = Math.min(levelValueUsdc, targetUsdc - accumulatedUsdc);
      const sharesTaken = take / level.price;
      accumulatedUsdc += take;
      accumulatedShares += sharesTaken;
      weightedPriceSum += level.price * sharesTaken;
      if (accumulatedUsdc >= targetUsdc) break;
    }

    if (accumulatedUsdc < targetUsdc * 0.5) {
      return { pass: false, reason: "THIN_BOOK" };
    }

    const avgFillPrice = weightedPriceSum / accumulatedShares;
    const slippagePct = Math.abs(avgFillPrice - levels[0]!.price) / levels[0]!.price;
    if (slippagePct > env.MAX_SLIPPAGE_PCT / 100) {
      return { pass: false, reason: `SLIPPAGE_TOO_HIGH: ${(slippagePct * 100).toFixed(2)}%` };
    }

    return { pass: true };
  } catch (err) {
    return { pass: false, reason: `LIQUIDITY_ERROR: ${(err as Error).message}` };
  }
}

export async function checkPositionLimit(ctx: FilterContext): Promise<FilterDecision> {
  const env = getEnv();
  const db = getDb();

  const existing = await db
    .select()
    .from(copiedPositions)
    .where(
      and(
        eq(copiedPositions.tokenId, ctx.signal.tokenId),
        eq(copiedPositions.side, ctx.signal.side),
        eq(copiedPositions.status, "OPEN"),
      ),
    );

  if (existing.length >= env.MAX_BUYS_PER_TOKEN) {
    return { pass: false, reason: `MAX_POSITIONS_REACHED: ${existing.length}/${env.MAX_BUYS_PER_TOKEN}` };
  }
  return { pass: true };
}

export function checkPortfolioCap(ctx: FilterContext): FilterDecision {
  const env = getEnv();
  const capUsdc = env.MAX_CAPITAL_USDC * (env.MAX_CAPITAL_AT_RISK_PCT / 100);
  if (ctx.totalDeployedUsdc >= capUsdc) {
    return { pass: false, reason: `PORTFOLIO_CAP: ${ctx.totalDeployedUsdc.toFixed(2)}/${capUsdc.toFixed(2)}` };
  }
  return { pass: true };
}

export async function checkCooldown(ctx: FilterContext): Promise<FilterDecision> {
  const env = getEnv();
  if (env.COOLDOWN_MINUTES === 0) return { pass: true };

  const redis = getRedis();
  const key = `cooldown:${ctx.signal.whaleAddress}:${ctx.signal.conditionId}`;
  const existing = await redis.get(key);
  if (existing) {
    return { pass: false, reason: `COOLDOWN_ACTIVE` };
  }
  return { pass: true };
}

export async function setCooldown(whale: string, conditionId: string): Promise<void> {
  const env = getEnv();
  if (env.COOLDOWN_MINUTES === 0) return;
  const redis = getRedis();
  const key = `cooldown:${whale}:${conditionId}`;
  await redis.set(key, "1", "EX", env.COOLDOWN_MINUTES * 60);
}
