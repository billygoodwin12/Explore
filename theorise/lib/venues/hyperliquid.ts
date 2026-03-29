import { MarketData, Position, TradeOrder, TradeResult } from '@/lib/venues/types';

const API_URL = 'https://api.hyperliquid.xyz/info';

// ---------------------------------------------------------------------------
// Types for Hyperliquid API responses
// ---------------------------------------------------------------------------

interface AssetMeta {
  name: string;
  szDecimals: number;
}

interface AssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx?: string;
}

// Cache for asset metadata (universe list) — refreshed every 60s
let cachedMeta: { assets: AssetMeta[]; contexts: AssetCtx[]; ts: number } | null = null;
const CACHE_TTL = 60_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchMetaAndCtxs(): Promise<{ assets: AssetMeta[]; contexts: AssetCtx[] }> {
  if (cachedMeta && Date.now() - cachedMeta.ts < CACHE_TTL) {
    return { assets: cachedMeta.assets, contexts: cachedMeta.contexts };
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  });

  if (!res.ok) {
    throw new Error(`Hyperliquid API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  // Response is [meta, assetCtxs] where meta has { universe: AssetMeta[] }
  const assets: AssetMeta[] = data[0].universe;
  const contexts: AssetCtx[] = data[1];

  cachedMeta = { assets, contexts, ts: Date.now() };
  return { assets, contexts };
}

/**
 * Find the index of a symbol in the Hyperliquid universe.
 * Tries exact match first, then case-insensitive.
 */
function findAssetIndex(assets: AssetMeta[], symbol: string): number {
  const upper = symbol.toUpperCase();
  // Common aliases
  const ALIASES: Record<string, string> = {
    BITCOIN: 'BTC',
    ETHEREUM: 'ETH',
    SOLANA: 'SOL',
  };
  const resolved = ALIASES[upper] ?? upper;

  const idx = assets.findIndex(
    (a) => a.name.toUpperCase() === resolved,
  );
  return idx;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the list of all tradeable symbols on Hyperliquid.
 */
export async function getAvailableSymbols(): Promise<string[]> {
  const { assets } = await fetchMetaAndCtxs();
  return assets.map((a) => a.name);
}

/**
 * Fetch real-time market data for a Hyperliquid perpetual instrument.
 */
export async function getMarketData(symbol: string): Promise<MarketData> {
  const { assets, contexts } = await fetchMetaAndCtxs();
  const idx = findAssetIndex(assets, symbol);

  if (idx === -1) {
    throw new Error(`Symbol "${symbol}" not found on Hyperliquid`);
  }

  const ctx = contexts[idx];
  const markPrice = parseFloat(ctx.markPx);
  const prevDayPrice = parseFloat(ctx.prevDayPx);
  const change24h = prevDayPrice > 0
    ? ((markPrice - prevDayPrice) / prevDayPrice) * 100
    : 0;

  return {
    price: markPrice,
    change24h: parseFloat(change24h.toFixed(2)),
    volume24h: parseFloat(ctx.dayNtlVlm),
    fundingRate: parseFloat(ctx.funding),
    openInterest: parseFloat(ctx.openInterest),
  };
}

/**
 * Fetch account state for a Hyperliquid wallet address.
 * Still mock — requires wallet signature for real data.
 */
export async function getAccountState(
  address: string,
): Promise<{ balance: number; positions: Position[] }> {
  return {
    balance: 0,
    positions: [],
  };
}

/**
 * Place an order on Hyperliquid.
 * Still mock — requires wallet signature for real execution.
 */
export async function placeOrder(order: TradeOrder): Promise<TradeResult> {
  return {
    orderId: `HL-${Date.now()}-mock`,
    status: 'pending',
    error: 'Execution not yet implemented — connect wallet first',
  };
}
