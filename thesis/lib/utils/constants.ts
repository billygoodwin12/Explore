// ---------------------------------------------------------------------------
// App-wide constants
// ---------------------------------------------------------------------------

/** Supported trading venues */
export const VENUES = {
  HYPERLIQUID: 'hyperliquid',
  POLYMARKET: 'polymarket',
} as const;

/** Human-readable venue labels */
export const VENUE_LABELS: Record<string, string> = {
  hyperliquid: 'Hyperliquid',
  polymarket: 'Polymarket',
};

// ---------------------------------------------------------------------------
// Chain configuration
// ---------------------------------------------------------------------------

export const CHAIN_IDS = {
  ARBITRUM: 42161,
  POLYGON: 137,
  ETHEREUM: 1,
  HYPERLIQUID_L1: 999, // Hyperliquid native chain
} as const;

export const DEFAULT_CHAIN_ID = CHAIN_IDS.ARBITRUM;

// ---------------------------------------------------------------------------
// API endpoints
// ---------------------------------------------------------------------------

export const API_ENDPOINTS = {
  HYPERLIQUID_REST: 'https://api.hyperliquid.xyz',
  HYPERLIQUID_WS: 'wss://api.hyperliquid.xyz/ws',
  HYPERLIQUID_INFO: 'https://api.hyperliquid.xyz/info',
  HYPERLIQUID_EXCHANGE: 'https://api.hyperliquid.xyz/exchange',

  POLYMARKET_REST: 'https://clob.polymarket.com',
  POLYMARKET_GAMMA: 'https://gamma-api.polymarket.com',

  /** Internal Next.js API routes */
  THESIS_ANALYZE: '/api/thesis/analyze',
  MARKET_DATA: '/api/market-data',
  TRADE_EXECUTE: '/api/trade/execute',
  PORTFOLIO: '/api/portfolio',
} as const;

// ---------------------------------------------------------------------------
// Trading defaults
// ---------------------------------------------------------------------------

/** Available leverage multipliers presented in the UI */
export const DEFAULT_LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20] as const;

/** Default leverage when none is selected */
export const DEFAULT_LEVERAGE = 1;

/** Minimum trade size in USDC */
export const MIN_TRADE_SIZE_USDC = 10;

/** Maximum trade size in USDC (safety rail) */
export const MAX_TRADE_SIZE_USDC = 100_000;

/** Minimum position size for Polymarket in USDC */
export const MIN_POLYMARKET_SIZE_USDC = 5;

/** Slippage tolerance as a fraction (0.5%) */
export const DEFAULT_SLIPPAGE_TOLERANCE = 0.005;

/** Maximum slippage tolerance as a fraction (2%) */
export const MAX_SLIPPAGE_TOLERANCE = 0.02;

// ---------------------------------------------------------------------------
// Formatting & display
// ---------------------------------------------------------------------------

/** Default number of decimals for price display */
export const DEFAULT_PRICE_DECIMALS = 2;

/** Number of decimals for funding-rate display */
export const FUNDING_RATE_DECIMALS = 4;

/** Number of characters shown at each end of a truncated address */
export const ADDRESS_TRUNCATION_LENGTH = 4;

// ---------------------------------------------------------------------------
// Polling & refresh intervals (ms)
// ---------------------------------------------------------------------------

export const POLLING_INTERVALS = {
  MARKET_DATA: 5_000,
  PORTFOLIO: 10_000,
  ORDER_STATUS: 2_000,
  FUNDING_RATE: 60_000,
} as const;

// ---------------------------------------------------------------------------
// Conviction thresholds (0-1 scale)
// ---------------------------------------------------------------------------

export const CONVICTION_THRESHOLDS = {
  LOW: 0.3,
  MEDIUM: 0.6,
  HIGH: 0.8,
} as const;

export const CONVICTION_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/**
 * Return a human-readable conviction label for a 0-1 score.
 */
export function convictionLabel(score: number): string {
  if (score >= CONVICTION_THRESHOLDS.HIGH) return 'High';
  if (score >= CONVICTION_THRESHOLDS.MEDIUM) return 'Medium';
  return 'Low';
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export const APP_NAME = 'Thesis';
export const APP_DESCRIPTION =
  'AI-powered macro thesis to trade execution pipeline';
export const MAX_CHAT_HISTORY = 50;
export const MAX_RECOMMENDATIONS_PER_THESIS = 8;
