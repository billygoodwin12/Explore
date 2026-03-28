// ---------------------------------------------------------------------------
// Keyword → Tradeable Instrument mapping
// ---------------------------------------------------------------------------

import type { Venue, InstrumentType, Direction, Category, CorrelationType } from '../venues/types';

export interface Instrument {
  venue: Venue;
  instrumentType: InstrumentType;
  symbol: string;
  name: string;
  category: Category;
  /** Default directional bias when the keyword is bullish for the theme */
  defaultDirection: Direction;
  /** How closely this instrument tracks the keyword's thesis */
  correlationType: CorrelationType;
}

// ---------------------------------------------------------------------------
// Master instrument catalogue
// ---------------------------------------------------------------------------

const CL_PERP: Instrument = {
  venue: 'hyperliquid',
  instrumentType: 'perp',
  symbol: 'CL-PERP',
  name: 'Crude Oil Perpetual',
  category: 'commodity',
  defaultDirection: 'LONG',
  correlationType: 'direct',
};

const NG_PERP: Instrument = {
  venue: 'hyperliquid',
  instrumentType: 'perp',
  symbol: 'NG-PERP',
  name: 'Natural Gas Perpetual',
  category: 'commodity',
  defaultDirection: 'LONG',
  correlationType: 'direct',
};

const GC_PERP: Instrument = {
  venue: 'hyperliquid',
  instrumentType: 'perp',
  symbol: 'GC-PERP',
  name: 'Gold Perpetual',
  category: 'commodity',
  defaultDirection: 'LONG',
  correlationType: 'direct',
};

const SI_PERP: Instrument = {
  venue: 'hyperliquid',
  instrumentType: 'perp',
  symbol: 'SI-PERP',
  name: 'Silver Perpetual',
  category: 'commodity',
  defaultDirection: 'LONG',
  correlationType: 'direct',
};

const BTC_PERP: Instrument = {
  venue: 'hyperliquid',
  instrumentType: 'perp',
  symbol: 'BTC-PERP',
  name: 'Bitcoin Perpetual',
  category: 'crypto',
  defaultDirection: 'LONG',
  correlationType: 'direct',
};

const ETH_PERP: Instrument = {
  venue: 'hyperliquid',
  instrumentType: 'perp',
  symbol: 'ETH-PERP',
  name: 'Ethereum Perpetual',
  category: 'crypto',
  defaultDirection: 'LONG',
  correlationType: 'direct',
};

const SOL_PERP: Instrument = {
  venue: 'hyperliquid',
  instrumentType: 'perp',
  symbol: 'SOL-PERP',
  name: 'Solana Perpetual',
  category: 'crypto',
  defaultDirection: 'LONG',
  correlationType: 'second_order',
};

const SPX_PERP: Instrument = {
  venue: 'hyperliquid',
  instrumentType: 'perp',
  symbol: 'SPX-PERP',
  name: 'S&P 500 Perpetual',
  category: 'equity_index',
  defaultDirection: 'LONG',
  correlationType: 'direct',
};

const NDX_PERP: Instrument = {
  venue: 'hyperliquid',
  instrumentType: 'perp',
  symbol: 'NDX-PERP',
  name: 'Nasdaq 100 Perpetual',
  category: 'equity_index',
  defaultDirection: 'LONG',
  correlationType: 'direct',
};

const EU_PERP: Instrument = {
  venue: 'hyperliquid',
  instrumentType: 'perp',
  symbol: 'EU-PERP',
  name: 'Euro/USD Perpetual',
  category: 'commodity', // FX treated under commodity umbrella
  defaultDirection: 'LONG',
  correlationType: 'second_order',
};

// Polymarket prediction instruments
const PM_RECESSION: Instrument = {
  venue: 'polymarket',
  instrumentType: 'prediction',
  symbol: 'us-recession-2026',
  name: 'US Recession in 2026',
  category: 'prediction',
  defaultDirection: 'BUY_YES',
  correlationType: 'direct',
};

const PM_FED_RATE_CUT: Instrument = {
  venue: 'polymarket',
  instrumentType: 'prediction',
  symbol: 'fed-rate-cut-next-meeting',
  name: 'Fed Rate Cut at Next Meeting',
  category: 'prediction',
  defaultDirection: 'BUY_YES',
  correlationType: 'direct',
};

const PM_CHINA_TAIWAN: Instrument = {
  venue: 'polymarket',
  instrumentType: 'prediction',
  symbol: 'china-taiwan-conflict-2026',
  name: 'China–Taiwan Conflict in 2026',
  category: 'prediction',
  defaultDirection: 'BUY_YES',
  correlationType: 'direct',
};

const PM_INFLATION: Instrument = {
  venue: 'polymarket',
  instrumentType: 'prediction',
  symbol: 'us-cpi-above-3-pct',
  name: 'US CPI Above 3%',
  category: 'prediction',
  defaultDirection: 'BUY_YES',
  correlationType: 'direct',
};

const PM_BTC_100K: Instrument = {
  venue: 'polymarket',
  instrumentType: 'prediction',
  symbol: 'bitcoin-above-100k-2026',
  name: 'Bitcoin Above $100K in 2026',
  category: 'prediction',
  defaultDirection: 'BUY_YES',
  correlationType: 'second_order',
};

// ---------------------------------------------------------------------------
// Keyword → instruments mapping
// ---------------------------------------------------------------------------

/**
 * Each key is a lowercase keyword or short phrase. The value is the list of
 * instruments that are relevant when that keyword appears in a thesis.
 */
const KEYWORD_MAP: Record<string, Instrument[]> = {
  // Energy
  oil: [CL_PERP],
  crude: [CL_PERP],
  'crude oil': [CL_PERP],
  energy: [CL_PERP, NG_PERP],
  'natural gas': [NG_PERP],
  gas: [NG_PERP],
  opec: [CL_PERP],
  petroleum: [CL_PERP],

  // Precious metals
  gold: [GC_PERP],
  silver: [SI_PERP],
  'safe haven': [GC_PERP, BTC_PERP],
  'precious metals': [GC_PERP, SI_PERP],

  // Crypto
  bitcoin: [BTC_PERP, PM_BTC_100K],
  btc: [BTC_PERP, PM_BTC_100K],
  ethereum: [ETH_PERP],
  eth: [ETH_PERP],
  crypto: [BTC_PERP, ETH_PERP, SOL_PERP],
  cryptocurrency: [BTC_PERP, ETH_PERP],
  solana: [SOL_PERP],
  sol: [SOL_PERP],
  'digital assets': [BTC_PERP, ETH_PERP, SOL_PERP],

  // Inflation / rates
  inflation: [GC_PERP, BTC_PERP, PM_INFLATION],
  cpi: [GC_PERP, PM_INFLATION],
  deflation: [GC_PERP, SPX_PERP],
  'interest rates': [PM_FED_RATE_CUT, GC_PERP],
  fed: [PM_FED_RATE_CUT, GC_PERP, SPX_PERP],
  'rate cut': [PM_FED_RATE_CUT, SPX_PERP, BTC_PERP],
  'rate hike': [PM_FED_RATE_CUT, GC_PERP],
  hawkish: [GC_PERP, PM_FED_RATE_CUT],
  dovish: [SPX_PERP, BTC_PERP, PM_FED_RATE_CUT],

  // Geopolitics
  china: [PM_CHINA_TAIWAN, GC_PERP, CL_PERP],
  taiwan: [PM_CHINA_TAIWAN, GC_PERP],
  'china taiwan': [PM_CHINA_TAIWAN, GC_PERP, CL_PERP],
  geopolitics: [GC_PERP, CL_PERP],
  war: [GC_PERP, CL_PERP],
  sanctions: [CL_PERP, GC_PERP],
  tariff: [SPX_PERP, EU_PERP],
  tariffs: [SPX_PERP, EU_PERP],
  'trade war': [SPX_PERP, GC_PERP, EU_PERP],

  // Macro / recession
  recession: [PM_RECESSION, GC_PERP, SPX_PERP],
  slowdown: [PM_RECESSION, SPX_PERP],
  'soft landing': [SPX_PERP, BTC_PERP],
  gdp: [SPX_PERP, PM_RECESSION],
  unemployment: [PM_RECESSION, SPX_PERP],

  // Equities
  stocks: [SPX_PERP, NDX_PERP],
  equities: [SPX_PERP, NDX_PERP],
  'sp500': [SPX_PERP],
  's&p': [SPX_PERP],
  nasdaq: [NDX_PERP],
  tech: [NDX_PERP],

  // Dollar / FX
  dollar: [EU_PERP, GC_PERP],
  usd: [EU_PERP, GC_PERP],
  euro: [EU_PERP],
  fx: [EU_PERP],
  'strong dollar': [EU_PERP, GC_PERP],
  'weak dollar': [GC_PERP, BTC_PERP, EU_PERP],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Given an array of keywords (e.g. extracted from an AI thesis), return a
 * deduplicated list of relevant tradeable instruments ordered by the number
 * of keyword hits (most relevant first).
 */
export function getInstrumentsForKeywords(keywords: string[]): Instrument[] {
  const hitCount = new Map<string, { instrument: Instrument; count: number }>();

  for (const raw of keywords) {
    const kw = raw.trim().toLowerCase();

    // Try exact match first
    const directMatch = KEYWORD_MAP[kw];
    if (directMatch) {
      for (const inst of directMatch) {
        const existing = hitCount.get(inst.symbol);
        if (existing) {
          existing.count += 1;
        } else {
          hitCount.set(inst.symbol, { instrument: inst, count: 1 });
        }
      }
      continue;
    }

    // Fall back to substring matching against all map keys
    for (const [mapKey, instruments] of Object.entries(KEYWORD_MAP)) {
      if (kw.includes(mapKey) || mapKey.includes(kw)) {
        for (const inst of instruments) {
          const existing = hitCount.get(inst.symbol);
          if (existing) {
            existing.count += 1;
          } else {
            hitCount.set(inst.symbol, { instrument: inst, count: 1 });
          }
        }
      }
    }
  }

  // Sort by hit count descending, then alphabetically by symbol for stability
  return Array.from(hitCount.values())
    .sort((a, b) => b.count - a.count || a.instrument.symbol.localeCompare(b.instrument.symbol))
    .map((entry) => entry.instrument);
}

/**
 * Return every keyword recognised by the mapping.
 */
export function getAllKeywords(): string[] {
  return Object.keys(KEYWORD_MAP).sort();
}
