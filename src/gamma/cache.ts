import type { GammaMarket } from "./client.js";
import { fetchActiveMarkets } from "./client.js";
import { logger } from "../logger.js";

export class MarketCache {
  private bySlug = new Map<string, GammaMarket>();
  private byConditionId = new Map<string, GammaMarket>();
  private byTokenId = new Map<string, GammaMarket>();
  private lastRefresh = 0;

  async refresh(): Promise<void> {
    const markets = await fetchActiveMarkets();
    this.bySlug.clear();
    this.byConditionId.clear();
    this.byTokenId.clear();

    for (const m of markets) {
      this.bySlug.set(m.slug, m);
      this.byConditionId.set(m.conditionId, m);
      for (const t of m.tokens) {
        this.byTokenId.set(t.token_id, m);
      }
    }

    this.lastRefresh = Date.now();
    logger.info({ count: markets.length }, "Market cache refreshed");
  }

  getBySlug(slug: string): GammaMarket | undefined {
    return this.bySlug.get(slug);
  }

  getByConditionId(conditionId: string): GammaMarket | undefined {
    return this.byConditionId.get(conditionId);
  }

  getByTokenId(tokenId: string): GammaMarket | undefined {
    return this.byTokenId.get(tokenId);
  }

  getAll(): GammaMarket[] {
    return Array.from(this.bySlug.values());
  }

  getLastRefreshTime(): number {
    return this.lastRefresh;
  }
}
