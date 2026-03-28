import { NextRequest, NextResponse } from 'next/server';
import { MarketData } from '@/lib/venues/types';

const MOCK_PRICES: Record<string, MarketData> = {
  BTC:  { price: 87200,  change24h: 2.4,  volume24h: 4_200_000_000, fundingRate: 0.0085, openInterest: 12_500_000_000 },
  ETH:  { price: 2015,   change24h: 1.8,  volume24h: 1_800_000_000, fundingRate: 0.0062, openInterest: 5_800_000_000 },
  SOL:  { price: 142,    change24h: 3.1,  volume24h: 890_000_000,   fundingRate: 0.012,  openInterest: 1_200_000_000 },
  CL:   { price: 70.45,  change24h: -1.2, volume24h: 320_000_000,   fundingRate: -0.003, openInterest: 450_000_000 },
  GC:   { price: 3020,   change24h: 0.8,  volume24h: 550_000_000,   fundingRate: 0.001,  openInterest: 680_000_000 },
  SI:   { price: 33.5,   change24h: 1.5,  volume24h: 120_000_000,   fundingRate: 0.002,  openInterest: 180_000_000 },
  NG:   { price: 2.85,   change24h: -2.3, volume24h: 95_000_000,    fundingRate: -0.005, openInterest: 140_000_000 },
  HG:   { price: 4.15,   change24h: 0.3,  volume24h: 80_000_000,    fundingRate: 0.001,  openInterest: 110_000_000 },
  SPX:  { price: 5450,   change24h: 0.4,  volume24h: 2_100_000_000, fundingRate: 0.002,  openInterest: 3_200_000_000 },
  NDQ:  { price: 18900,  change24h: 0.6,  volume24h: 1_600_000_000, fundingRate: 0.003,  openInterest: 2_400_000_000 },
  RUT:  { price: 2050,   change24h: -0.2, volume24h: 400_000_000,   fundingRate: -0.001, openInterest: 600_000_000 },
};

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json(
      { error: 'Missing "symbols" query parameter (comma-separated)' },
      { status: 400 }
    );
  }

  const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase());
  const prices: Record<string, MarketData> = {};

  for (const symbol of symbols) {
    if (MOCK_PRICES[symbol]) {
      prices[symbol] = MOCK_PRICES[symbol];
    } else {
      // Generate fallback mock data for unknown symbols
      prices[symbol] = {
        price: parseFloat((10 + Math.random() * 1000).toFixed(2)),
        change24h: parseFloat(((Math.random() - 0.5) * 10).toFixed(2)),
        volume24h: Math.round(10_000_000 + Math.random() * 500_000_000),
        fundingRate: parseFloat(((Math.random() - 0.3) * 0.02).toFixed(4)),
        openInterest: Math.round(50_000_000 + Math.random() * 1_000_000_000),
      };
    }
  }

  return NextResponse.json({ prices });
}
