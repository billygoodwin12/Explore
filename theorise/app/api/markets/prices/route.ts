import { NextRequest, NextResponse } from 'next/server';
import { getMarketData as getHyperliquidData } from '@/lib/venues/hyperliquid';
import { MarketData } from '@/lib/venues/types';

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json(
      { error: 'Missing "symbols" query parameter (comma-separated)' },
      { status: 400 },
    );
  }

  const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase());
  const prices: Record<string, MarketData> = {};

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        prices[symbol] = await getHyperliquidData(symbol);
      } catch {
        // Skip symbols that don't exist on Hyperliquid
      }
    }),
  );

  return NextResponse.json({ prices });
}
