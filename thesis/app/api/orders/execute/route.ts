import { NextRequest, NextResponse } from 'next/server';
import { TradeOrder, TradeResult } from '@/lib/venues/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const order = body as TradeOrder;

    // Validate required fields
    if (!order.venue || !order.symbol || !order.direction || !order.sizeUsdc) {
      return NextResponse.json(
        { error: 'Missing required fields: venue, symbol, direction, sizeUsdc' },
        { status: 400 }
      );
    }

    if (order.sizeUsdc <= 0) {
      return NextResponse.json(
        { error: 'sizeUsdc must be positive' },
        { status: 400 }
      );
    }

    // Simulate order fill with slight slippage
    const basePrice = 100 + Math.random() * 5000;
    const slippage = order.direction === 'LONG' || order.direction === 'BUY_YES' ? 1.001 : 0.999;
    const fillPrice = parseFloat((basePrice * slippage).toFixed(4));

    const result: TradeResult = {
      orderId: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'filled',
      fillPrice,
      txHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      filledAt: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to execute order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
