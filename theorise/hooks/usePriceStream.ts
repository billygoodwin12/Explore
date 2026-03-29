'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { MarketData } from '@/lib/venues/types';

/**
 * Polls the real Hyperliquid price API every `intervalMs` for live prices.
 * Returns a map of symbol → MarketData that updates in real time.
 */
export function usePriceStream(symbols: string[], intervalMs = 5000) {
  const [prices, setPrices] = useState<Record<string, MarketData>>({});
  const symbolsKey = symbols.sort().join(',');
  const activeRef = useRef(true);

  const fetchPrices = useCallback(async () => {
    if (!symbolsKey) return;
    try {
      const res = await fetch(`/api/markets/prices?symbols=${symbolsKey}`);
      if (!res.ok) return;
      const data = await res.json();
      if (activeRef.current && data.prices) {
        setPrices(data.prices);
      }
    } catch {
      // Silently ignore fetch errors
    }
  }, [symbolsKey]);

  useEffect(() => {
    if (symbols.length === 0) return;
    activeRef.current = true;

    // Fetch immediately
    fetchPrices();

    // Then poll
    const interval = setInterval(fetchPrices, intervalMs);

    return () => {
      activeRef.current = false;
      clearInterval(interval);
    };
  }, [fetchPrices, intervalMs, symbols.length]);

  return { prices };
}
