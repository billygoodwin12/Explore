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
  image: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search for prediction markets matching a query string.
 * Calls the real Polymarket Gamma API.
 */
export async function searchMarkets(query: string): Promise<GammaMarket[]> {
  const params = new URLSearchParams({
    closed: 'false',
    active: 'true',
    limit: '10',
  });
  if (query) {
    params.set('search', query);
  }

  const res = await fetch(`${GAMMA_API}/markets?${params.toString()}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Polymarket API error: ${res.status} ${res.statusText}`);
  }

  const markets: GammaMarket[] = await res.json();
  return markets;
}

/**
 * Search for a single market by its slug or question text.
 */
export async function findMarket(slugOrQuery: string): Promise<GammaMarket | null> {
  // Try slug-based lookup first
  const params = new URLSearchParams({
    slug: slugOrQuery,
    closed: 'false',
  });

  let res = await fetch(`${GAMMA_API}/markets?${params.toString()}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (res.ok) {
    const markets: GammaMarket[] = await res.json();
    if (markets.length > 0) return markets[0];
  }

  // Fallback: search by text
  const searchResults = await searchMarkets(slugOrQuery);
  return searchResults.length > 0 ? searchResults[0] : null;
}

/**
 * Fetch market data for a specific Polymarket prediction market.
 * Accepts a slug, condition ID, or search query.
 */
export async function getMarketData(identifier: string): Promise<MarketData> {
  const market = await findMarket(identifier);

  if (!market) {
    throw new Error(`Polymarket market "${identifier}" not found`);
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
  const totalVolume = parseFloat(market.volume) || 0;

  return {
    price: yesPrice,
    change24h: 0, // Gamma API doesn't provide 24h price change directly
    volume24h,
    expiryDate: market.endDate?.split('T')[0],
    totalTraders: Math.round(totalVolume / 50), // rough estimate
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
