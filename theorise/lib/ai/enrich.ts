import { Recommendation, EnrichedRecommendation, MarketData } from '../venues/types';
import { getMarketData as getHyperliquidData } from '../venues/hyperliquid';
import { getMarketData as getPolymarketData } from '../venues/polymarket';

/**
 * Enrich AI recommendations with real market data from Hyperliquid and Polymarket.
 * Falls back to a placeholder if the API call fails (e.g. symbol not found).
 */
export async function enrichRecommendations(
  recommendations: Recommendation[]
): Promise<EnrichedRecommendation[]> {
  const enriched = await Promise.all(
    recommendations.map(async (rec) => {
      let marketData: MarketData;

      try {
        if (rec.venue === 'hyperliquid') {
          marketData = await getHyperliquidData(rec.symbol);
        } else {
          marketData = await getPolymarketData(rec.symbol);
        }
      } catch (err) {
        console.warn(
          `[enrich] Failed to fetch market data for ${rec.venue}:${rec.symbol}:`,
          err instanceof Error ? err.message : err,
        );
        // Fallback so the UI still renders
        marketData = fallbackMarketData(rec);
      }

      // If Polymarket matched a real question, use it as the display name
      const name =
        rec.venue === 'polymarket' && marketData.matchedQuestion
          ? marketData.matchedQuestion
          : rec.name;

      return { ...rec, name, marketData } satisfies EnrichedRecommendation;
    })
  );

  return enriched;
}

function fallbackMarketData(rec: Recommendation): MarketData {
  if (rec.instrument_type === 'perp') {
    return {
      price: 0,
      change24h: 0,
      volume24h: 0,
      fundingRate: 0,
      openInterest: 0,
    };
  }
  return {
    price: 0.5,
    change24h: 0,
    volume24h: 0,
    expiryDate: undefined,
    totalTraders: 0,
  };
}
