import { NextResponse } from 'next/server';
import { Position, Venue } from '@/lib/venues/types';

// ---------------------------------------------------------------------------
// Mock portfolio state
// ---------------------------------------------------------------------------

const MOCK_POSITIONS: Position[] = [
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
    symbol: 'GC',
    name: 'Gold Perpetual',
    direction: 'LONG',
    size: 2,
    entryPrice: 2_980,
    currentPrice: 3_020,
    unrealizedPnl: 80,
    unrealizedPnlPercent: 1.34,
    leverage: 2,
    liquidationPrice: 1_520,
  },
  {
    venue: 'hyperliquid',
    symbol: 'CL',
    name: 'Crude Oil Perpetual',
    direction: 'SHORT',
    size: 10,
    entryPrice: 72.10,
    currentPrice: 70.45,
    unrealizedPnl: 16.5,
    unrealizedPnlPercent: 2.29,
    leverage: 5,
    liquidationPrice: 86.50,
  },
  {
    venue: 'polymarket',
    symbol: 'fed-rate-cut-2026',
    name: 'Fed Rate Cut in 2026',
    direction: 'BUY_YES',
    size: 500,
    entryPrice: 0.62,
    currentPrice: 0.68,
    unrealizedPnl: 30,
    unrealizedPnlPercent: 9.68,
    leverage: 1,
  },
];

interface PortfolioState {
  accountValue: number;
  availableBalance: number;
  totalUnrealizedPnl: number;
  positions: Position[];
}

function buildPortfolioState(): PortfolioState {
  const totalUnrealizedPnl = MOCK_POSITIONS.reduce(
    (sum, p) => sum + p.unrealizedPnl,
    0,
  );

  const accountValue = 25_000 + totalUnrealizedPnl;
  const marginUsed = MOCK_POSITIONS.reduce((sum, p) => {
    const notional = p.size * p.entryPrice;
    return sum + notional / p.leverage;
  }, 0);

  return {
    accountValue: parseFloat(accountValue.toFixed(2)),
    availableBalance: parseFloat((accountValue - marginUsed).toFixed(2)),
    totalUnrealizedPnl: parseFloat(totalUnrealizedPnl.toFixed(2)),
    positions: MOCK_POSITIONS,
  };
}

export async function GET() {
  return NextResponse.json(buildPortfolioState());
}
