'use client';

// ---------------------------------------------------------------------------
// usePriceStream – simulated WebSocket price streaming
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';

const BASE_PRICES: Record<string, number> = {
  BTC: 87_200,
  ETH: 2_015,
  SOL: 142,
  ARB: 1.12,
  DOGE: 0.168,
  AVAX: 35.5,
  LINK: 14.8,
  SPX: 5_450,
  GC: 3_020,
};

function jitter(base: number): number {
  const pct = (Math.random() - 0.5) * 0.004; // +/- 0.2%
  return parseFloat((base * (1 + pct)).toPrecision(6));
}

export function usePriceStream(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const lastPrices = useRef<Record<string, number>>({});

  useEffect(() => {
    if (symbols.length === 0) return;

    // Seed initial prices
    const seed: Record<string, number> = {};
    for (const sym of symbols) {
      const base = BASE_PRICES[sym.toUpperCase()] ?? 100 + Math.random() * 500;
      seed[sym] = base;
      lastPrices.current[sym] = base;
    }
    setPrices(seed);

    const interval = setInterval(() => {
      const next: Record<string, number> = {};
      for (const sym of symbols) {
        const prev = lastPrices.current[sym] ?? 100;
        const newPrice = jitter(prev);
        next[sym] = newPrice;
        lastPrices.current[sym] = newPrice;
      }
      setPrices((prev) => ({ ...prev, ...next }));
    }, 2000);

    return () => clearInterval(interval);
  }, [symbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return { prices };
}
