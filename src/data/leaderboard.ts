import { DATA_BASE_URL } from "../config/index.js";
import { logger } from "../logger.js";

export interface LeaderboardEntry {
  proxyWallet: string;
  username: string | null;
  pnl: number;
  volume: number;
  rank: number;
}

export type LeaderboardWindow = "1d" | "7d" | "30d" | "all";

export async function fetchLeaderboard(
  window: LeaderboardWindow = "all",
  limit: number = 100,
): Promise<LeaderboardEntry[]> {
  const url = `${DATA_BASE_URL}/leaderboard?window=${window}&limit=${limit}&sortBy=pnl`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Leaderboard fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data.map((row, i) => ({
    proxyWallet: String(row.proxyWallet ?? row.proxy_wallet ?? row.address ?? ""),
    username: (row.name ?? row.username ?? null) as string | null,
    pnl: Number(row.amount ?? row.pnl ?? 0),
    volume: Number(row.volume ?? 0),
    rank: i + 1,
  })).filter((r) => r.proxyWallet.length > 0);
}
