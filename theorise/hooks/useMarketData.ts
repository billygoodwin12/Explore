'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = 'https://api.hyperliquid.xyz/info';

/** Assets we care about — maps Hyperliquid name → display config */
const TRACKED_ASSETS: Record<string, { name: string; cat: 'crypto' | 'commodity' | 'index' }> = {
  BTC:   { name: 'Bitcoin',    cat: 'crypto' },
  ETH:   { name: 'Ethereum',   cat: 'crypto' },
  SOL:   { name: 'Solana',     cat: 'crypto' },
  AVAX:  { name: 'Avalanche',  cat: 'crypto' },
  ARB:   { name: 'Arbitrum',   cat: 'crypto' },
  LINK:  { name: 'Chainlink',  cat: 'crypto' },
  DOGE:  { name: 'Dogecoin',   cat: 'crypto' },
  SUI:   { name: 'Sui',        cat: 'crypto' },
  XRP:   { name: 'XRP',        cat: 'crypto' },
  AAVE:  { name: 'Aave',       cat: 'crypto' },
  OP:    { name: 'Optimism',   cat: 'crypto' },
  APT:   { name: 'Aptos',      cat: 'crypto' },
};

export interface MarketData {
  sym: string;
  name: string;
  cat: 'crypto' | 'commodity' | 'index';
  price: number;
  chg: number;
  funding: number;
  oi: string;
  maxLeverage: number;
}

function formatOI(usdValue: number): string {
  if (usdValue >= 1e9) return `${(usdValue / 1e9).toFixed(1)}B`;
  if (usdValue >= 1e6) return `${(usdValue / 1e6).toFixed(0)}M`;
  if (usdValue >= 1e3) return `${(usdValue / 1e3).toFixed(0)}K`;
  return usdValue.toFixed(0);
}

async function fetchMarkets(): Promise<MarketData[]> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const [meta, ctxs] = await res.json();
  const universe: { name: string; maxLeverage: number; isDelisted?: boolean }[] = meta.universe;

  const markets: MarketData[] = [];

  for (let i = 0; i < universe.length; i++) {
    const asset = universe[i];
    const ctx = ctxs[i];
    const tracked = TRACKED_ASSETS[asset.name];

    if (!tracked || asset.isDelisted) continue;

    const midPx = parseFloat(ctx.midPx || ctx.markPx);
    const prevDayPx = parseFloat(ctx.prevDayPx);
    const chg = prevDayPx > 0 ? ((midPx - prevDayPx) / prevDayPx) * 100 : 0;
    const oi = parseFloat(ctx.openInterest) * midPx;

    markets.push({
      sym: asset.name,
      name: tracked.name,
      cat: tracked.cat,
      price: midPx,
      chg: Math.round(chg * 100) / 100,
      funding: parseFloat(ctx.funding),
      oi: formatOI(oi),
      maxLeverage: asset.maxLeverage,
    });
  }

  // Sort: BTC, ETH first, then by OI descending
  const priority = ['BTC', 'ETH', 'SOL'];
  markets.sort((a, b) => {
    const ai = priority.indexOf(a.sym);
    const bi = priority.indexOf(b.sym);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });

  return markets;
}

export function useMarketData(refreshInterval = 5000) {
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchMarkets();
      setMarkets(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, refreshInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh, refreshInterval]);

  return { markets, loading, error, refresh };
}
