'use client';

import { useState, useEffect, useRef } from 'react';

const API_URL = 'https://api.hyperliquid.xyz/info';
const WS_URL = 'wss://api.hyperliquid.xyz/ws';

export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const LOOKBACK: Record<Interval, number> = {
  '1m':  4 * 3600_000,
  '5m':  24 * 3600_000,
  '15m': 3 * 86400_000,
  '1h':  7 * 86400_000,
  '4h':  30 * 86400_000,
  '1d':  180 * 86400_000,
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchCandles(coin: string, interval: Interval): Promise<Candle[]> {
  const now = Date.now();
  const start = now - LOOKBACK[interval];
  const body = JSON.stringify({
    type: 'candleSnapshot',
    req: { coin, interval, startTime: start, endTime: now },
  });

  const attempts = 3;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if ((res.status === 429 || res.status >= 500) && i < attempts - 1) {
        await sleep(600 * (i + 1) + Math.random() * 400);
        continue;
      }
      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();
      return data.map((c: { t: number; o: string; h: string; l: string; c: string; v: string }) => ({
        time: Math.floor(c.t / 1000),
        open: parseFloat(c.o),
        high: parseFloat(c.h),
        low: parseFloat(c.l),
        close: parseFloat(c.c),
        volume: parseFloat(c.v),
      }));
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(600 * (i + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('candleSnapshot failed');
}

export function useCandleData(coin: string, interval: Interval) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const candlesRef = useRef<Candle[]>([]);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    async function init() {
      setLoading(true);
      try {
        const data = await fetchCandles(coin, interval);
        if (cancelled) return;
        candlesRef.current = data;
        setCandles(data);
      } catch (e) {
        // WebSocket will seed candles; don't crash the render.
        console.warn('[candles] initial fetch failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    function connect() {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'candle', coin, interval },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.channel === 'candle' && msg.data?.s === coin) {
            const c = msg.data;
            const newCandle: Candle = {
              time: Math.floor(c.t / 1000),
              open: parseFloat(c.o),
              high: parseFloat(c.h),
              low: parseFloat(c.l),
              close: parseFloat(c.c),
              volume: parseFloat(c.v),
            };

            const current = candlesRef.current;
            const lastIdx = current.length - 1;

            let updated: Candle[];
            if (lastIdx >= 0 && current[lastIdx].time === newCandle.time) {
              updated = [...current];
              updated[lastIdx] = newCandle;
            } else {
              updated = [...current, newCandle];
            }

            candlesRef.current = updated;
            setCandles(updated);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (!cancelled) reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    }

    init().then(() => {
      if (!cancelled) connect();
    });

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [coin, interval]);

  return { candles, loading };
}
