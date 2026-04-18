import { DATA_BASE_URL } from "../config/index.js";

export interface WalletPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  outcome: string;
  outcomeIndex: number;
  size: number;
  avgPrice: number;
  currentPrice: number;
  usdcValue: number;
  cashPnl: number;
  percentPnl: number;
  title: string;
  slug: string;
  endDate: string | null;
  redeemable: boolean;
}

export async function fetchWalletPositions(address: string): Promise<WalletPosition[]> {
  const url = `${DATA_BASE_URL}/positions?user=${address}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Positions fetch failed for ${address}: ${res.status}`);
  }

  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data.map((r) => ({
    proxyWallet: String(r.proxyWallet ?? r.user ?? address),
    asset: String(r.asset ?? ""),
    conditionId: String(r.conditionId ?? r.condition_id ?? ""),
    outcome: String(r.outcome ?? ""),
    outcomeIndex: Number(r.outcomeIndex ?? 0),
    size: Number(r.size ?? 0),
    avgPrice: Number(r.avgPrice ?? r.avg_price ?? 0),
    currentPrice: Number(r.curPrice ?? r.currentPrice ?? 0),
    usdcValue: Number(r.currentValue ?? r.usdc_value ?? 0),
    cashPnl: Number(r.cashPnl ?? r.cash_pnl ?? 0),
    percentPnl: Number(r.percentPnl ?? r.percent_pnl ?? 0),
    title: String(r.title ?? ""),
    slug: String(r.slug ?? ""),
    endDate: (r.endDate as string | null) ?? null,
    redeemable: Boolean(r.redeemable),
  }));
}

export async function fetchWalletBalance(address: string): Promise<number> {
  try {
    const url = `${DATA_BASE_URL}/value?user=${address}`;
    const res = await fetch(url);
    if (!res.ok) return 0;
    const data = (await res.json()) as { value?: number; totalValue?: number };
    return Number(data.value ?? data.totalValue ?? 0);
  } catch {
    return 0;
  }
}
