// ---------------------------------------------------------------------------
// Shared venue types
// ---------------------------------------------------------------------------

export type Venue = 'hyperliquid' | 'polymarket';

export type InstrumentType = 'perp' | 'prediction';

export type Direction = 'LONG' | 'SHORT' | 'BUY_YES' | 'BUY_NO';

export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'failed';

export type Category = 'commodity' | 'crypto' | 'equity_index' | 'prediction';

export type CorrelationType = 'direct' | 'second_order' | 'hedge';

// ---------------------------------------------------------------------------
// Recommendation & Thesis
// ---------------------------------------------------------------------------

export interface Recommendation {
  venue: Venue;
  instrument_type: InstrumentType;
  symbol: string;
  name: string;
  direction: Direction;
  conviction: number;
  rationale: string;
  category: Category;
  correlation_to_thesis: CorrelationType;
}

export interface ThesisAnalysis {
  thesis_summary: string;
  causal_chain: string[];
  recommendations: Recommendation[];
}

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

export interface MarketData {
  price: number;
  change24h: number;
  volume24h: number;
  fundingRate?: number;
  openInterest?: number;
  expiryDate?: string;
  totalTraders?: number;
  /** For Polymarket: the actual matched market question */
  matchedQuestion?: string;
}

export interface EnrichedRecommendation extends Recommendation {
  marketData: MarketData;
}

// ---------------------------------------------------------------------------
// Trade execution
// ---------------------------------------------------------------------------

export interface TradeOrder {
  venue: Venue;
  symbol: string;
  direction: Direction;
  sizeUsdc: number;
  leverage: number;
}

export interface TradeResult {
  orderId: string;
  status: OrderStatus;
  fillPrice?: number;
  txHash?: string;
  filledAt?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Instrument search
// ---------------------------------------------------------------------------

export interface InstrumentSearchResult {
  venue: Venue;
  symbol: string;
  name: string;
  instrument_type: InstrumentType;
  category: Category;
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export interface Position {
  venue: Venue;
  symbol: string;
  name: string;
  direction: Direction;
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  leverage: number;
  liquidationPrice?: number;
}
