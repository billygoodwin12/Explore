import { Recommendation, EnrichedRecommendation, MarketData } from '../venues/types';

// Realistic mock prices for common instruments
const MOCK_PRICES: Record<string, { price: number; change24h: number }> = {
  BTC:  { price: 87200,  change24h: 2.4 },
  ETH:  { price: 2015,   change24h: 1.8 },
  SOL:  { price: 142,    change24h: 3.1 },
  ARB:  { price: 1.12,   change24h: -0.6 },
  DOGE: { price: 0.168,  change24h: 4.2 },
  AVAX: { price: 35.5,   change24h: 1.2 },
  LINK: { price: 14.8,   change24h: -0.3 },
  MATIC:{ price: 0.52,   change24h: -1.1 },
  OP:   { price: 1.85,   change24h: 2.0 },
  APT:  { price: 8.90,   change24h: 0.5 },
  CL:   { price: 70.45,  change24h: -1.2 },
  GC:   { price: 3020,   change24h: 0.8 },
  SI:   { price: 33.5,   change24h: 1.5 },
  NG:   { price: 2.85,   change24h: -2.3 },
  HG:   { price: 4.15,   change24h: 0.3 },
  SPX:  { price: 5450,   change24h: 0.4 },
  NDQ:  { price: 18900,  change24h: 0.6 },
  RUT:  { price: 2050,   change24h: -0.2 },
  EUR:  { price: 1.085,  change24h: 0.1 },
  GBP:  { price: 1.265,  change24h: -0.1 },
  JPY:  { price: 151.2,  change24h: 0.3 },
};

function generatePerpData(symbol: string): MarketData {
  const known = MOCK_PRICES[symbol];
  const price = known?.price ?? 100 + Math.random() * 900;
  const change24h = known?.change24h ?? (Math.random() - 0.5) * 10;

  return {
    price,
    change24h,
    volume24h: Math.round(price * (500_000 + Math.random() * 5_000_000)),
    fundingRate: parseFloat(((Math.random() - 0.3) * 0.06).toFixed(4)),
    openInterest: Math.round(price * (1_000_000 + Math.random() * 20_000_000)),
  };
}

function generatePredictionData(symbol: string): MarketData {
  const yesPrice = parseFloat((0.15 + Math.random() * 0.7).toFixed(2));

  // Generate a future expiry date
  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + 1 + Math.floor(Math.random() * 6));

  return {
    price: yesPrice,
    change24h: parseFloat(((Math.random() - 0.5) * 10).toFixed(1)),
    volume24h: Math.round(50_000 + Math.random() * 2_000_000),
    expiryDate: expiry.toISOString().split('T')[0],
    totalTraders: Math.round(200 + Math.random() * 10_000),
  };
}

function generateMarketData(rec: Recommendation): MarketData {
  if (rec.instrument_type === 'perp') {
    return generatePerpData(rec.symbol);
  }
  return generatePredictionData(rec.symbol);
}

export async function enrichRecommendations(
  recommendations: Recommendation[]
): Promise<EnrichedRecommendation[]> {
  // Process all recommendations in parallel
  const enriched = await Promise.all(
    recommendations.map(async (rec) => {
      const marketData = generateMarketData(rec);
      return {
        ...rec,
        marketData,
      } satisfies EnrichedRecommendation;
    })
  );

  return enriched;
}
