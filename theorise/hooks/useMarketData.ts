'use client';

import { useSyncExternalStore, useEffect, useRef } from 'react';

const API_URL = 'https://api.hyperliquid.xyz/info';
const WS_URL = 'wss://api.hyperliquid.xyz/ws';

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

function sortMarkets(markets: MarketData[]): MarketData[] {
  const priority = ['BTC', 'ETH', 'SOL'];
  return [...markets].sort((a, b) => {
    const ai = priority.indexOf(a.sym);
    const bi = priority.indexOf(b.sym);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });
}

// ── Singleton store ──────────────────────────────────────────────

let markets: MarketData[] = [];
let loading = true;
let error: string | null = null;
let listeners = new Set<() => void>();
let started = false;
let subscriberCount = 0;
let ws: WebSocket | null = null;
let fullRefreshInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

let snapshot = { markets, loading, error };

function notify() {
  snapshot = { markets, loading, error };
  listeners.forEach(l => l());
}

function getSnapshot() {
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  subscriberCount++;
  if (!started) start();
  return () => {
    listeners.delete(listener);
    subscriberCount--;
    if (subscriberCount <= 0) stop();
  };
}

async function fetchFull() {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const [meta, ctxs] = await res.json();
    const universe: { name: string; maxLeverage: number; isDelisted?: boolean }[] = meta.universe;
    const result: MarketData[] = [];

    for (let i = 0; i < universe.length; i++) {
      const asset = universe[i];
      const ctx = ctxs[i];
      const tracked = TRACKED_ASSETS[asset.name];
      if (!tracked || asset.isDelisted) continue;

      const midPx = parseFloat(ctx.midPx || ctx.markPx);
      const prevDayPx = parseFloat(ctx.prevDayPx);
      const chg = prevDayPx > 0 ? ((midPx - prevDayPx) / prevDayPx) * 100 : 0;
      const oi = parseFloat(ctx.openInterest) * midPx;

      result.push({
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

    markets = sortMarkets(result);
    error = null;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to fetch';
  } finally {
    loading = false;
    notify();
  }
}

function connectWs() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    ws!.send(JSON.stringify({
      method: 'subscribe',
      subscription: { type: 'allMids' },
    }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.channel === 'allMids' && msg.data?.mids) {
        const mids: Record<string, string> = msg.data.mids;
        if (markets.length === 0) return;

        let changed = false;
        const updated = markets.map(m => {
          const newPx = mids[m.sym];
          if (newPx) {
            const price = parseFloat(newPx);
            if (price !== m.price) {
              changed = true;
              return { ...m, price };
            }
          }
          return m;
        });

        if (changed) {
          markets = updated;
          notify();
        }
      }
    } catch {
      // ignore
    }
  };

  ws.onclose = () => {
    if (subscriberCount > 0) {
      reconnectTimeout = setTimeout(connectWs, 2000);
    }
  };

  ws.onerror = () => ws?.close();
}

function start() {
  started = true;
  fetchFull();
  fullRefreshInterval = setInterval(fetchFull, 30_000);
  connectWs();
}

function stop() {
  started = false;
  if (fullRefreshInterval) clearInterval(fullRefreshInterval);
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
}

// ── Hook ─────────────────────────────────────────────────────────

// Stable reference for SSR
const SERVER_SNAPSHOT = { markets: [] as MarketData[], loading: true, error: null };

export function useMarketData() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  return { ...snap, refresh: fetchFull };
}
