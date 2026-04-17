import type { NewsClassification } from "./classifier.js";
import type { NewsItem } from "./asknews.js";
import { classifyNews } from "./classifier.js";
import { cancelMarketOrders } from "../clob/orders.js";
import { getRedis, REDIS_CHANNELS } from "../persist/redis.js";
import { logger } from "../logger.js";

export interface MarketMapping {
  slug: string;
  conditionId: string;
  tokenIds: string[];
}

const COOLING_DURATION_MS = 15 * 60 * 1000;
const coolingMarkets = new Map<string, number>();

export function isCooling(slug: string): boolean {
  const until = coolingMarkets.get(slug);
  if (!until) return false;
  if (Date.now() > until) {
    coolingMarkets.delete(slug);
    return false;
  }
  return true;
}

export function setCooling(slug: string, durationMs: number = COOLING_DURATION_MS): void {
  coolingMarkets.set(slug, Date.now() + durationMs);
}

export function getCoolingMarkets(): Map<string, number> {
  return new Map(coolingMarkets);
}

export async function processNewsItem(
  news: NewsItem,
  activeSlugs: string[],
  marketMappings: Map<string, MarketMapping>,
): Promise<NewsClassification> {
  const classification = await classifyNews(news, activeSlugs);

  if (
    classification.severity === "medium" ||
    classification.severity === "high"
  ) {
    const affectedInUniverse = classification.affected_slugs.filter((slug) =>
      marketMappings.has(slug),
    );

    for (const slug of affectedInUniverse) {
      const mapping = marketMappings.get(slug)!;
      logger.warn(
        { slug, severity: classification.severity, newsId: news.id },
        "Withdrawing quotes due to news event",
      );

      for (const tokenId of mapping.tokenIds) {
        try {
          await cancelMarketOrders(mapping.conditionId, tokenId);
        } catch (err) {
          logger.error(
            { err, slug, tokenId },
            "Failed to cancel market orders",
          );
        }
      }

      setCooling(slug);
    }

    const redis = getRedis();
    await redis.publish(
      REDIS_CHANNELS.NEWS,
      JSON.stringify({
        type: "NEWS_WITHDRAW",
        newsId: news.id,
        headline: news.headline,
        severity: classification.severity,
        affectedSlugs: affectedInUniverse,
        direction: classification.direction,
        rationale: classification.rationale,
        timestamp: Date.now(),
      }),
    );
  }

  return classification;
}
