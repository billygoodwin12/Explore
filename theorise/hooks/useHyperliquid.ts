// ---------------------------------------------------------------------------
// useHyperliquid – hook wrapping Hyperliquid venue functions
// ---------------------------------------------------------------------------

import { useCallback } from 'react';
import {
  getMarketData as hlGetMarketData,
  getAccountState as hlGetAccountState,
  placeOrder as hlPlaceOrder,
} from '@/lib/venues/hyperliquid';
import type { TradeOrder } from '@/lib/venues/types';

export function useHyperliquid() {
  const getMarketData = useCallback((symbol: string) => {
    return hlGetMarketData(symbol);
  }, []);

  const getAccountState = useCallback((address: string) => {
    return hlGetAccountState(address);
  }, []);

  const placeOrder = useCallback((order: TradeOrder) => {
    return hlPlaceOrder(order);
  }, []);

  return { getMarketData, getAccountState, placeOrder };
}
