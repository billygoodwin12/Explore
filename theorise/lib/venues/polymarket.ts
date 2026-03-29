import { MarketData, TradeOrder, TradeResult } from '@/lib/venues/types';

const GAMMA_API = 'https://gamma-api.polymarket.com';

// ---------------------------------------------------------------------------
// Types for Polymarket Gamma API responses
// ---------------------------------------------------------------------------

interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  conditionId: string;
  outcomePrices: string; // JSON string like "[\"0.65\",\"0.35\"]"
  volume: string;
  volume24hr: string;
  liquidity: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  description: string;
}

// ---------------------------------------------------------------------------
// Cache top markets so we can do client-side keyword matching
// ---------------------------------------------------------------------------

let cachedMarkets: { markets: GammaMarket[]; ts: number } | null = null;
const CACHE_TTL = 120_000; // 2 minutes

async function fetchTopMarkets(): Promise<GammaMarket[]> {
  if (cachedMarkets && Date.now() - cachedMarkets.ts < CACHE_TTL) {
    return cachedMarkets.markets;
  }

  // Fetch a large batch of active, high-volume markets
  const params = new URLSearchParams({
    active: 'true',
    closed: 'false',
    order: 'volume24hr',
    ascending: 'false',
    limit: '100',
  });

  const res = await fetch(`${GAMMA_API}/markets?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Polymarket API error: ${res.status} ${res.statusText}`);
  }

  const markets: GammaMarket[] = await res.json();
  cachedMarkets = { markets, ts: Date.now() };
  return markets;
}

// ---------------------------------------------------------------------------
// Keyword matching — score markets against a search query
// ---------------------------------------------------------------------------

function scoreMarket(market: GammaMarket, keywords: string[]): number {
  const text = `${market.question} ${market.description || ''}`.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) {
      // Bonus for question match vs description match
      score += market.question.toLowerCase().includes(kw) ? 3 : 1;
    }
  }
  // Boost by volume (prefer liquid markets)
  const vol = parseFloat(market.volume24hr) || 0;
  if (vol > 500_000) score += 2;
  else if (vol > 100_000) score += 1;
  return score;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search for prediction markets matching a query string.
 * Uses client-side keyword matching against top active markets,
 * since the Gamma API search is unreliable.
 */
export async function searchMarkets(query: string): Promise<GammaMarket[]> {
  const markets = await fetchTopMarkets();

  if (!query) return markets.slice(0, 10);

  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2); // drop short words like "a", "in", "by"

  if (keywords.length === 0) return markets.slice(0, 10);

  const scored = markets
    .map((m) => ({ market: m, score: scoreMarket(m, keywords) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 10).map((s) => s.market);
}

/**
 * Find the best matching market for a query.
 */
export async function findMarket(query: string): Promise<GammaMarket | null> {
  const results = await searchMarkets(query);
  return results.length > 0 ? results[0] : null;
}

/**
 * Fetch market data for a specific Polymarket prediction market.
 * Accepts a search query — finds the best matching active market.
 */
export async function getMarketData(identifier: string): Promise<MarketData> {
  const market = await findMarket(identifier);

  if (!market) {
    throw new Error(`Polymarket: no market found for "${identifier}"`);
  }

  // Parse outcome prices — [yesPrice, noPrice]
  let yesPrice = 0.5;
  try {
    const prices = JSON.parse(market.outcomePrices);
    yesPrice = parseFloat(prices[0]);
  } catch {
    // fallback
  }

  const volume24h = parseFloat(market.volume24hr) || 0;

  return {
    price: yesPrice,
    change24h: 0, // Gamma API doesn't provide 24h price change
    volume24h,
    expiryDate: market.endDate?.split('T')[0],
    totalTraders: Math.round((parseFloat(market.volume) || 0) / 50),
    matchedQuestion: market.question,
  };
}

/**
 * Place an order on Polymarket.
 * Still mock — requires wallet signature and CLOB API for real execution.
 */
export async function placeOrder(order: TradeOrder): Promise<TradeResult> {
  return {
    orderId: `PM-${Date.now()}-mock`,
    status: 'pending',
    error: 'Execution not yet implemented — connect wallet first',
  };
}
