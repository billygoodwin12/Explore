import { fetchActiveMarkets, type GammaMarket } from "../gamma/index.js";
import { fetchPriceHistory } from "../data/index.js";
import type { ClobAdapter } from "../clob/adapter.js";
import { expectedRewardPerUsd } from "./rewards.js";
import { getRedis, REDIS_KEYS, REDIS_CHANNELS } from "../persist/redis.js";
import { logger } from "../logger.js";

export interface SelectorConfig {
  volThreshold: number;
  minDepthUsdc: number;
  minDaysToResolution: number;
  maxDaysToResolution: number;
  excludedCategories: string[];
  maxUniverse: number;
  quoteSize: number;
  plannedSpread: number;
}

const DEFAULT_CONFIG: SelectorConfig = {
  volThreshold: 0.05,
  minDepthUsdc: 500,
  minDaysToResolution: 7,
  maxDaysToResolution: 180,
  excludedCategories: ["breaking_news", "geopolitics_hot"],
  maxUniverse: 5,
  quoteSize: 100,
  plannedSpread: 0.02,
};

export interface SelectedMarket {
  conditionId: string;
  slug: string;
  question: string;
  negRisk: boolean;
  tokenIds: string[];
  maxIncentiveSpreadBps: number;
  minIncentiveSize: number;
  dailyRate: number;
  rewardPerUsd: number;
  realizedVol24h: number;
}

function computeRealizedVol(prices: Array<{ t: number; p: number }>): number {
  if (prices.length < 2) return 0;
  let sumSqReturns = 0;
  for (let i = 1; i < prices.length; i++) {
    const ret = Math.log(prices[i]!.p / prices[i - 1]!.p);
    sumSqReturns += ret * ret;
  }
  return Math.sqrt(sumSqReturns / (prices.length - 1));
}

export async function selectUniverse(
  adapter: ClobAdapter,
  config: SelectorConfig = DEFAULT_CONFIG,
): Promise<SelectedMarket[]> {
  logger.info("Running nightly market selection...");
  const markets = await fetchActiveMarkets();

  const candidates: SelectedMarket[] = [];

  for (const m of markets) {
    if (!m.rewards || m.rewards.dailyRate === 0) continue;

    const daysToEnd =
      (new Date(m.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysToEnd < config.minDaysToResolution) continue;
    if (daysToEnd > config.maxDaysToResolution) continue;

    if (config.excludedCategories.includes(m.category)) continue;

    if (m.tokens.length === 0) continue;
    const primaryToken = m.tokens[0]!;

    let realizedVol: number;
    try {
      const history = await fetchPriceHistory(primaryToken.token_id, "1d", 24);
      realizedVol = computeRealizedVol(history);
    } catch {
      logger.warn({ slug: m.slug }, "Failed to fetch price history, skipping");
      continue;
    }

    if (realizedVol > config.volThreshold) continue;

    let depth: number;
    try {
      const book = await adapter.getOrderBook(primaryToken.token_id);
      const bidDepth = book.bids
        .filter((b) => b.price >= primaryToken.price - 0.01)
        .reduce((sum, b) => sum + b.size * b.price, 0);
      const askDepth = book.asks
        .filter((a) => a.price <= primaryToken.price + 0.01)
        .reduce((sum, a) => sum + a.size * a.price, 0);
      depth = bidDepth + askDepth;
    } catch {
      continue;
    }

    if (depth < config.minDepthUsdc) continue;

    const spreadBps = config.plannedSpread * 10000;
    const rewardPerUsd = expectedRewardPerUsd(
      {
        quoteSize: config.quoteSize,
        spreadBps,
        maxIncentiveSpreadBps: m.rewards.maxIncentiveSpread * 10000,
        minIncentiveSize: m.rewards.minIncentiveSize,
        bidSize: config.quoteSize,
        askSize: config.quoteSize,
        dailyRate: m.rewards.dailyRate,
      },
      1000,
      config.quoteSize * 2,
    );

    candidates.push({
      conditionId: m.conditionId,
      slug: m.slug,
      question: m.question,
      negRisk: m.negRisk,
      tokenIds: m.tokens.map((t) => t.token_id),
      maxIncentiveSpreadBps: m.rewards.maxIncentiveSpread * 10000,
      minIncentiveSize: m.rewards.minIncentiveSize,
      dailyRate: m.rewards.dailyRate,
      rewardPerUsd,
      realizedVol24h: realizedVol,
    });
  }

  candidates.sort((a, b) => b.rewardPerUsd - a.rewardPerUsd);
  const selected = candidates.slice(0, config.maxUniverse);

  const redis = getRedis();
  await redis.set(REDIS_KEYS.UNIVERSE, JSON.stringify(selected));
  await redis.publish(
    REDIS_CHANNELS.SYSTEM,
    JSON.stringify({ type: "universeUpdate", count: selected.length }),
  );

  logger.info(
    { count: selected.length, slugs: selected.map((s) => s.slug) },
    "Market universe selected",
  );

  return selected;
}
