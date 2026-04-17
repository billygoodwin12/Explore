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

  const withTokens = markets.filter((m) => m.tokens.length > 0);
  const withRewards = withTokens.filter((m) => m.rewards && m.rewards.dailyRate > 0);

  logger.info({
    total: markets.length,
    withTokens: withTokens.length,
    withRewards: withRewards.length,
  }, "Market filter stats");

  // If no rewarded markets, fall back to highest-volume markets with tokens
  const pool = withRewards.length > 0 ? withRewards : withTokens;
  const useRewards = withRewards.length > 0;

  const candidates: SelectedMarket[] = [];

  for (const m of pool) {
    const daysToEnd =
      (new Date(m.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysToEnd < config.minDaysToResolution) continue;
    if (daysToEnd > config.maxDaysToResolution) continue;

    if (config.excludedCategories.includes(m.category)) continue;

    const primaryToken = m.tokens[0]!;
    if (!primaryToken.token_id) continue;

    let realizedVol = 0;
    try {
      const history = await fetchPriceHistory(primaryToken.token_id, "1d", 24);
      realizedVol = computeRealizedVol(history);
    } catch {
      // Skip vol filter if we can't fetch history
    }

    if (realizedVol > config.volThreshold && realizedVol > 0) continue;

    // Skip depth check in paper mode to avoid hammering the API for every market
    // The quoter will check the book when it actually runs

    const maxSpreadBps = m.rewards?.maxIncentiveSpread
      ? m.rewards.maxIncentiveSpread * 10000
      : 500;
    const minSize = m.rewards?.minIncentiveSize ?? 50;
    const dailyRate = m.rewards?.dailyRate ?? 0;

    const spreadBps = config.plannedSpread * 10000;
    let rewardPerUsd = 0;
    if (useRewards && dailyRate > 0) {
      rewardPerUsd = expectedRewardPerUsd(
        {
          quoteSize: config.quoteSize,
          spreadBps,
          maxIncentiveSpreadBps: maxSpreadBps,
          minIncentiveSize: minSize,
          bidSize: config.quoteSize,
          askSize: config.quoteSize,
          dailyRate,
        },
        1000,
        config.quoteSize * 2,
      );
    } else {
      rewardPerUsd = m.volume;
    }

    candidates.push({
      conditionId: m.conditionId,
      slug: m.slug,
      question: m.question,
      negRisk: m.negRisk,
      tokenIds: m.tokens.map((t) => t.token_id),
      maxIncentiveSpreadBps: maxSpreadBps,
      minIncentiveSize: minSize,
      dailyRate,
      rewardPerUsd,
      realizedVol24h: realizedVol,
    });

    // Stop after enough candidates to avoid slow startup
    if (candidates.length >= config.maxUniverse * 3) break;
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
