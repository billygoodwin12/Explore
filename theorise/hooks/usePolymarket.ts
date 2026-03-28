// ---------------------------------------------------------------------------
// usePolymarket – hook wrapping Polymarket venue functions
// ---------------------------------------------------------------------------

import { useCallback } from 'react';
import {
  searchMarkets as pmSearchMarkets,
  getMarketData as pmGetMarketData,
  placeOrder as pmPlaceOrder,
} from '@/lib/venues/polymarket';
import type { TradeOrder } from '@/lib/venues/types';

export function usePolymarket() {
  const searchMarkets = useCallback((query: string) => {
    return pmSearchMarkets(query);
  }, []);

  const getMarketData = useCallback((slug: string) => {
    return pmGetMarketData(slug);
  }, []);

  const placeOrder = useCallback((order: TradeOrder) => {
    return pmPlaceOrder(order);
  }, []);

  return { searchMarkets, getMarketData, placeOrder };
}
