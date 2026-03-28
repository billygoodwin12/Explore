import { MarketData, TradeOrder, TradeResult } from '@/lib/venues/types';

// ---------------------------------------------------------------------------
// Mock prediction markets
// ---------------------------------------------------------------------------

interface PredictionMarket {
  slug: string;
  question: string;
  yesPrice: number;
  volume24h: number;
  totalTraders: number;
  expiryDate: string;
}

const MOCK_MARKETS: PredictionMarket[] = [
  {
    slug: 'fed-rate-cut-2026',
    question: 'Will the Fed cut rates before July 2026?',
    yesPrice: 0.68,
    volume24h: 1_450_000,
    totalTraders: 8_200,
    expiryDate: '2026-07-01',
  },
  {
    slug: 'us-recession-2026',
    question: 'Will the US enter a recession in 2026?',
    yesPrice: 0.32,
    volume24h: 2_100_000,
    totalTraders: 12_400,
    expiryDate: '2026-12-31',
  },
  {
    slug: 'btc-100k-2026',
    question: 'Will Bitcoin exceed $100,000 in 2026?',
    yesPrice: 0.55,
    volume24h: 3_200_000,
    totalTraders: 18_900,
    expiryDate: '2026-12-31',
  },
  {
    slug: 'us-cpi-above-3-pct',
    question: 'Will US CPI exceed 3% YoY by Q3 2026?',
    yesPrice: 0.41,
    volume24h: 680_000,
    totalTraders: 4_100,
    expiryDate: '2026-09-30',
  },
  {
    slug: 'china-taiwan-conflict-2026',
    question: 'Will there be a military conflict between China and Taiwan in 2026?',
    yesPrice: 0.08,
    volume24h: 520_000,
    totalTraders: 6_300,
    expiryDate: '2026-12-31',
  },
  {
    slug: 'eth-above-5k-2026',
    question: 'Will Ethereum exceed $5,000 in 2026?',
    yesPrice: 0.22,
    volume24h: 890_000,
    totalTraders: 7_500,
    expiryDate: '2026-12-31',
  },
  {
    slug: 'us-election-2026-senate',
    question: 'Will Democrats win the Senate in 2026 midterms?',
    yesPrice: 0.47,
    volume24h: 4_500_000,
    totalTraders: 25_000,
    expiryDate: '2026-11-03',
  },
];

// ---------------------------------------------------------------------------
// Polymarket client (mock implementation)
// ---------------------------------------------------------------------------

/**
 * Search for prediction markets matching a query string.
 *
 * Returns mock markets filtered by question text or slug.
 */
export async function searchMarkets(query: string): Promise<PredictionMarket[]> {
  if (!query) return MOCK_MARKETS;

  const q = query.toLowerCase();
  return MOCK_MARKETS.filter(
    (m) =>
      m.slug.toLowerCase().includes(q) ||
      m.question.toLowerCase().includes(q),
  );
}

/**
 * Fetch market data for a specific Polymarket prediction market by slug.
 */
export async function getMarketData(slug: string): Promise<MarketData> {
  const market = MOCK_MARKETS.find(
    (m) => m.slug.toLowerCase() === slug.toLowerCase(),
  );

  if (market) {
    return {
      price: market.yesPrice,
      change24h: parseFloat(((Math.random() - 0.5) * 8).toFixed(1)),
      volume24h: market.volume24h,
      expiryDate: market.expiryDate,
      totalTraders: market.totalTraders,
    };
  }

  // Fallback for unknown slugs
  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + 1 + Math.floor(Math.random() * 6));

  return {
    price: parseFloat((0.15 + Math.random() * 0.7).toFixed(2)),
    change24h: parseFloat(((Math.random() - 0.5) * 10).toFixed(1)),
    volume24h: Math.round(50_000 + Math.random() * 2_000_000),
    expiryDate: expiry.toISOString().split('T')[0],
    totalTraders: Math.round(200 + Math.random() * 10_000),
  };
}

/**
 * Place an order on Polymarket.
 *
 * Returns a mock fill result. In production this would interact with the
 * Polymarket CLOB API to place the order.
 */
export async function placeOrder(order: TradeOrder): Promise<TradeResult> {
  const market = MOCK_MARKETS.find(
    (m) => m.slug.toLowerCase() === order.symbol.toLowerCase(),
  );

  const basePrice = market?.yesPrice ?? parseFloat((0.3 + Math.random() * 0.4).toFixed(2));

  // Slight slippage
  const slippage =
    order.direction === 'BUY_YES' || order.direction === 'LONG' ? 1.005 : 0.995;
  const fillPrice = parseFloat((basePrice * slippage).toFixed(4));

  return {
    orderId: `PM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'filled',
    fillPrice,
    txHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
    filledAt: new Date().toISOString(),
  };
}
