import { DATA_BASE_URL } from "../config/index.js";
import { buildL2Headers } from "../clob/auth.js";

export interface Position {
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  pnl: number;
  realizedPnl: number;
  side: string;
}

export interface Trade {
  id: string;
  market: string;
  assetId: string;
  side: string;
  price: number;
  size: number;
  fee: number;
  timestamp: string;
}

export async function fetchPositions(address: string): Promise<Position[]> {
  const path = `/positions?address=${address}`;
  const headers = buildL2Headers("GET", path);
  const res = await fetch(`${DATA_BASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`Positions fetch failed: ${res.status}`);

  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data.map((p) => ({
    asset: String(p.asset ?? ""),
    conditionId: String(p.conditionId ?? p.condition_id ?? ""),
    size: Number(p.size ?? 0),
    avgPrice: Number(p.avgPrice ?? p.avg_price ?? 0),
    curPrice: Number(p.curPrice ?? p.cur_price ?? 0),
    pnl: Number(p.pnl ?? 0),
    realizedPnl: Number(p.realizedPnl ?? p.realized_pnl ?? 0),
    side: String(p.side ?? ""),
  }));
}

export async function fetchTrades(
  address: string,
  market?: string,
  limit: number = 100,
): Promise<Trade[]> {
  let path = `/trades?address=${address}&limit=${limit}`;
  if (market) path += `&market=${market}`;

  const headers = buildL2Headers("GET", path);
  const res = await fetch(`${DATA_BASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`Trades fetch failed: ${res.status}`);

  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data.map((t) => ({
    id: String(t.id ?? ""),
    market: String(t.market ?? ""),
    assetId: String(t.assetId ?? t.asset_id ?? ""),
    side: String(t.side ?? ""),
    price: Number(t.price ?? 0),
    size: Number(t.size ?? 0),
    fee: Number(t.fee ?? 0),
    timestamp: String(t.timestamp ?? ""),
  }));
}

export async function fetchPriceHistory(
  tokenId: string,
  interval: string = "1h",
  fidelity: number = 60,
): Promise<Array<{ t: number; p: number }>> {
  const url = `https://clob.polymarket.com/prices-history?market=${tokenId}&interval=${interval}&fidelity=${fidelity}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Price history fetch failed: ${res.status}`);

  const data = (await res.json()) as { history: Array<{ t: number; p: number }> };
  return data.history;
}
