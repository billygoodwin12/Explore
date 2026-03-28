import { NextRequest, NextResponse } from 'next/server';
import { InstrumentSearchResult } from '@/lib/venues/types';

const INSTRUMENTS: InstrumentSearchResult[] = [
  { venue: 'hyperliquid', symbol: 'BTC',  name: 'Bitcoin',          instrument_type: 'perp', category: 'crypto' },
  { venue: 'hyperliquid', symbol: 'ETH',  name: 'Ethereum',         instrument_type: 'perp', category: 'crypto' },
  { venue: 'hyperliquid', symbol: 'SOL',  name: 'Solana',           instrument_type: 'perp', category: 'crypto' },
  { venue: 'hyperliquid', symbol: 'ARB',  name: 'Arbitrum',         instrument_type: 'perp', category: 'crypto' },
  { venue: 'hyperliquid', symbol: 'DOGE', name: 'Dogecoin',         instrument_type: 'perp', category: 'crypto' },
  { venue: 'hyperliquid', symbol: 'AVAX', name: 'Avalanche',        instrument_type: 'perp', category: 'crypto' },
  { venue: 'hyperliquid', symbol: 'LINK', name: 'Chainlink',        instrument_type: 'perp', category: 'crypto' },
  { venue: 'hyperliquid', symbol: 'CL',   name: 'Crude Oil',        instrument_type: 'perp', category: 'commodity' },
  { venue: 'hyperliquid', symbol: 'GC',   name: 'Gold',             instrument_type: 'perp', category: 'commodity' },
  { venue: 'hyperliquid', symbol: 'SI',   name: 'Silver',           instrument_type: 'perp', category: 'commodity' },
  { venue: 'hyperliquid', symbol: 'NG',   name: 'Natural Gas',      instrument_type: 'perp', category: 'commodity' },
  { venue: 'hyperliquid', symbol: 'HG',   name: 'Copper',           instrument_type: 'perp', category: 'commodity' },
  { venue: 'hyperliquid', symbol: 'SPX',  name: 'S&P 500',          instrument_type: 'perp', category: 'equity_index' },
  { venue: 'hyperliquid', symbol: 'NDQ',  name: 'Nasdaq 100',       instrument_type: 'perp', category: 'equity_index' },
  { venue: 'hyperliquid', symbol: 'RUT',  name: 'Russell 2000',     instrument_type: 'perp', category: 'equity_index' },
  { venue: 'polymarket',  symbol: 'fed-rate-cut-2026',        name: 'Fed Rate Cut in 2026',        instrument_type: 'prediction', category: 'prediction' },
  { venue: 'polymarket',  symbol: 'us-recession-2026',        name: 'US Recession in 2026',        instrument_type: 'prediction', category: 'prediction' },
  { venue: 'polymarket',  symbol: 'btc-100k-2026',            name: 'Bitcoin above $100k in 2026', instrument_type: 'prediction', category: 'prediction' },
];

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.toLowerCase() ?? '';

  if (!query) {
    return NextResponse.json({ results: INSTRUMENTS });
  }

  const results = INSTRUMENTS.filter(
    (inst) =>
      inst.symbol.toLowerCase().includes(query) ||
      inst.name.toLowerCase().includes(query) ||
      inst.category.includes(query) ||
      inst.venue.includes(query)
  );

  return NextResponse.json({ results });
}
