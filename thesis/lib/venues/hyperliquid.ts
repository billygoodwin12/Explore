import { MarketData, Position, TradeOrder, TradeResult } from '@/lib/venues/types';

// ---------------------------------------------------------------------------
// Mock price catalogue
// ---------------------------------------------------------------------------

const MOCK_PRICES: Record<string, { price: number; change24h: number }> = {
  BTC:  { price: 87_200, change24h: 2.4 },
  ETH:  { price: 2_015,  change24h: 1.8 },
  SOL:  { price: 142,    change24h: 3.1 },
  ARB:  { price: 1.12,   change24h: -0.6 },
  DOGE: { price: 0.168,  change24h: 4.2 },
  AVAX: { price: 35.5,   change24h: 1.2 },
  LINK: { price: 14.8,   change24h: -0.3 },
  MATIC:{ price: 0.52,   change24h: -1.1 },
  OP:   { price: 1.85,   change24h: 2.0 },
  APT:  { price: 8.9,    change24h: 0.5 },
  CL:   { price: 70.45,  change24h: -1.2 },
  GC:   { price: 3_020,  change24h: 0.8 },
  SI:   { price: 33.5,   change24h: 1.5 },
  NG:   { price: 2.85,   change24h: -2.3 },
  HG:   { price: 4.15,   change24h: 0.3 },
  SPX:  { price: 5_450,  change24h: 0.4 },
  NDQ:  { price: 18_900, change24h: 0.6 },
  RUT:  { price: 2_050,  change24h: -0.2 },
  EUR:  { price: 1.085,  change24h: 0.1 },
  GBP:  { price: 1.265,  change24h: -0.1 },
  JPY:  { price: 151.2,  change24h: 0.3 },
};

// ---------------------------------------------------------------------------
// Hyperliquid client (mock implementation)
// ---------------------------------------------------------------------------

/**
 * Fetch market data for a Hyperliquid perpetual instrument.
 *
 * Returns mock data while we don't have production API keys.
 * The interface matches what the real Hyperliquid REST API would return.
 */
export async function getMarketData(symbol: string): Promise<MarketData> {
  const known = MOCK_PRICES[symbol.toUpperCase()];
  const price = known?.price ?? 100 + Math.random() * 900;
  const change24h = known?.change24h ?? parseFloat(((Math.random() - 0.5) * 10).toFixed(2));

  return {
    price,
    change24h,
    volume24h: Math.round(price * (500_000 + Math.random() * 5_000_000)),
    fundingRate: parseFloat(((Math.random() - 0.3) * 0.06).toFixed(4)),
    openInterest: Math.round(price * (1_000_000 + Math.random() * 20_000_000)),
  };
}

/**
 * Fetch account state for a Hyperliquid wallet address.
 */
export async function getAccountState(
  address: string,
): Promise<{ balance: number; positions: Position[] }> {
  // Return mock account with a few positions
  return {
    balance: 25_000,
    positions: [
      {
        venue: 'hyperliquid',
        symbol: 'BTC',
        name: 'Bitcoin Perpetual',
        direction: 'LONG',
        size: 0.15,
        entryPrice: 85_400,
        currentPrice: 87_200,
        unrealizedPnl: 270,
        unrealizedPnlPercent: 2.11,
        leverage: 3,
        liquidationPrice: 62_100,
      },
      {
        venue: 'hyperliquid',
        symbol: 'ETH',
        name: 'Ethereum Perpetual',
        direction: 'SHORT',
        size: 5,
        entryPrice: 2_080,
        currentPrice: 2_015,
        unrealizedPnl: 325,
        unrealizedPnlPercent: 3.13,
        leverage: 5,
        liquidationPrice: 2_480,
      },
    ],
  };
}

/**
 * Place an order on Hyperliquid.
 *
 * Returns a mock fill result. In production this would sign and submit
 * the order via the Hyperliquid exchange API.
 */
export async function placeOrder(order: TradeOrder): Promise<TradeResult> {
  const known = MOCK_PRICES[order.symbol.toUpperCase()];
  const basePrice = known?.price ?? 100 + Math.random() * 5_000;

  // Simulate slight slippage based on direction
  const slippage =
    order.direction === 'LONG' || order.direction === 'BUY_YES' ? 1.001 : 0.999;
  const fillPrice = parseFloat((basePrice * slippage).toFixed(4));

  return {
    orderId: `HL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'filled',
    fillPrice,
    txHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
    filledAt: new Date().toISOString(),
  };
}
