'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = 'https://api.hyperliquid.xyz/info';
const WS_URL = 'wss://api.hyperliquid.xyz/ws';

/** Curated default-dex assets — tight list, friendly display names. */
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

export type MarketCategory = 'crypto' | 'commodity' | 'index' | 'hip3';

export interface MarketData {
  sym: string;         // Universe name (e.g. "BTC", "xyz:NVDA")
  displaySym: string;  // Short symbol for UI (e.g. "BTC", "NVDA")
  name: string;        // Display name (e.g. "Bitcoin", "NVIDIA")
  cat: MarketCategory;
  price: number;
  chg: number;
  funding: number;
  oi: string;
  volume: number;      // 24h notional volume (USD), for sorting
  maxLeverage: number;
  szDecimals: number;
  assetIndex: number;  // Pre-computed asset ID for /exchange orders
  dex?: string;        // undefined = default dex; "xyz" = HIP-3 dex name
}

interface PerpDex {
  name: string;
  fullName: string;
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
    // Default dex first
    if (!a.dex && b.dex) return -1;
    if (a.dex && !b.dex) return 1;

    // Within default dex: priority coins first, then curated order
    if (!a.dex && !b.dex) {
      const ai = priority.indexOf(a.sym);
      const bi = priority.indexOf(b.sym);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.displaySym.localeCompare(b.displaySym);
    }

    // Within HIP-3: sort by 24h notional volume descending
    return b.volume - a.volume;
  });
}

/** Strip a dex prefix like "xyz:NVDA" → "NVDA" */
function stripDexPrefix(name: string): string {
  const colon = name.indexOf(':');
  return colon >= 0 ? name.slice(colon + 1) : name;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function postInfo(body: Record<string, unknown>, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if ((res.status === 429 || res.status >= 500) && i < attempts - 1) {
        await sleep(600 * (i + 1) + Math.random() * 400);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(600 * (i + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Hyperliquid fetch failed');
}

async function fetchPerpDexs(): Promise<(PerpDex | null)[]> {
  const res = await postInfo({ type: 'perpDexs' });
  if (!res.ok) return [null];
  return await res.json();
}

async function fetchMetaCtxs(dex?: string) {
  const body: Record<string, unknown> = { type: 'metaAndAssetCtxs' };
  if (dex) body.dex = dex;
  const res = await postInfo(body);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return await res.json();
}

async function fetchMarkets(): Promise<MarketData[]> {
  const perpDexs = await fetchPerpDexs();

  const all: MarketData[] = [];

  // ── Default dex ───────────────────────────────────────────────
  try {
    const [meta, ctxs] = await fetchMetaCtxs();
    const universe: { name: string; maxLeverage: number; szDecimals: number; isDelisted?: boolean }[] = meta.universe;

    for (let i = 0; i < universe.length; i++) {
      const asset = universe[i];
      const ctx = ctxs[i];
      const tracked = TRACKED_ASSETS[asset.name];
      if (!tracked || asset.isDelisted) continue;

      const midPx = parseFloat(ctx.midPx || ctx.markPx);
      const prevDayPx = parseFloat(ctx.prevDayPx);
      const chg = prevDayPx > 0 ? ((midPx - prevDayPx) / prevDayPx) * 100 : 0;
      const oi = parseFloat(ctx.openInterest) * midPx;
      const volume = parseFloat(ctx.dayNtlVlm || '0');

      all.push({
        sym: asset.name,
        displaySym: asset.name,
        name: tracked.name,
        cat: tracked.cat,
        price: midPx,
        chg: Math.round(chg * 100) / 100,
        funding: parseFloat(ctx.funding),
        oi: formatOI(oi),
        volume,
        maxLeverage: asset.maxLeverage,
        szDecimals: asset.szDecimals,
        assetIndex: i, // default dex → raw universe index
      });
    }
  } catch (e) {
    console.warn('[markets] default dex fetch failed', e);
  }

  // ── HIP-3 perp dexes ──────────────────────────────────────────
  // perpDexs[0] is null (default dex); non-null entries are HIP-3.
  // Asset ID formula (from nktkas/hyperliquid SDK): 100000 + d*10000 + i
  // where d is the raw index in perpDexs (xyz at index 1 → 110000..).
  for (let d = 0; d < perpDexs.length; d++) {
    const dex = perpDexs[d];
    if (!dex) continue;
    try {
      const [meta, ctxs] = await fetchMetaCtxs(dex.name);
      const universe: { name: string; maxLeverage: number; szDecimals: number; isDelisted?: boolean }[] = meta.universe;

      for (let i = 0; i < universe.length; i++) {
        const asset = universe[i];
        const ctx = ctxs[i];
        if (asset.isDelisted) continue;

        const midPx = parseFloat(ctx.midPx || ctx.markPx);
        if (!Number.isFinite(midPx) || midPx <= 0) continue;
        const prevDayPx = parseFloat(ctx.prevDayPx);
        const chg = prevDayPx > 0 ? ((midPx - prevDayPx) / prevDayPx) * 100 : 0;
        const oi = parseFloat(ctx.openInterest || '0') * midPx;
        const volume = parseFloat(ctx.dayNtlVlm || '0');

        const displaySym = stripDexPrefix(asset.name);

        all.push({
          sym: asset.name,
          displaySym,
          name: displaySym,
          cat: 'hip3',
          price: midPx,
          chg: Math.round(chg * 100) / 100,
          funding: parseFloat(ctx.funding || '0'),
          oi: formatOI(oi),
          volume,
          maxLeverage: asset.maxLeverage,
          szDecimals: asset.szDecimals,
          assetIndex: 100000 + d * 10000 + i,
          dex: dex.name,
        });
      }
    } catch (e) {
      console.warn(`[markets] hip3 dex ${dex.name} fetch failed`, e);
    }
  }

  return sortMarkets(all);
}

export function useMarketData() {
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const marketsRef = useRef<MarketData[]>([]);

  // Initial REST fetch for full data
  const refresh = useCallback(async () => {
    try {
      const data = await fetchMarkets();
      if (data.length > 0) {
        marketsRef.current = data;
        setMarkets(data);
      }
      setError(null);
    } catch (e) {
      // Keep previous marketsRef on failure — don't clear UI.
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket for real-time mid price updates
  useEffect(() => {
    refresh();

    // Refresh full data every 60s for funding/OI updates
    const fullRefresh = setInterval(refresh, 60_000);

    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        // Subscribe to allMids channel for real-time price updates
        ws.send(JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'allMids' },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.channel === 'allMids' && msg.data?.mids) {
            const mids: Record<string, string> = msg.data.mids;
            const current = marketsRef.current;
            if (current.length === 0) return;

            let changed = false;
            const updated = current.map(m => {
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
              marketsRef.current = updated;
              setMarkets(updated);
            }
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      clearInterval(fullRefresh);
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on cleanup
        wsRef.current.close();
      }
    };
  }, [refresh]);

  return { markets, loading, error, refresh };
}
