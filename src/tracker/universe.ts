import { fetchLeaderboard, type LeaderboardEntry } from "../data/leaderboard.js";
import { fetchActivity, type ActivityEntry } from "../data/activity.js";
import { fetchWalletBalance } from "../data/positions.js";
import { getDb } from "../persist/db.js";
import { followedWallets } from "../persist/schema.js";
import { eq } from "drizzle-orm";
import { getEnv } from "../config/index.js";
import { logger } from "../logger.js";

export interface WalletScore {
  address: string;
  username: string | null;
  leaderboardRank: number;
  leaderboardPnl: number;
  winRate: number;
  marketBreadth: number;
  consistency: number;
  avgHoldPeriodHrs: number;
  maxDrawdown30d: number;
  tradesLast7d: number;
  botProbability: number;
  compositeScore: number;
  cachedBalanceUsdc: number;
}

export interface UniverseConfig {
  topLeaderboardCount: number;
  targetFollowCount: number;
  minMarketBreadth: number;
  maxBotProbability: number;
  minTradesLast7d: number;
  activityLookbackDays: number;
  weights: {
    pnl: number;
    winRate: number;
    breadth: number;
    consistency: number;
    activity: number;
  };
}

const DEFAULT_CONFIG: UniverseConfig = {
  topLeaderboardCount: 100,
  targetFollowCount: 30,
  minMarketBreadth: 5,
  maxBotProbability: 0.7,
  minTradesLast7d: 0,
  activityLookbackDays: 90,
  weights: { pnl: 0.30, winRate: 0.25, breadth: 0.15, consistency: 0.20, activity: 0.10 },
};

function detectBotProbability(trades: ActivityEntry[]): number {
  if (trades.length < 20) return 0;
  let rapidFire = 0;
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.timestamp - sorted[i - 1]!.timestamp < 1) rapidFire++;
  }
  return Math.min(1, rapidFire / sorted.length);
}

function computeWinRate(trades: ActivityEntry[]): number {
  if (trades.length === 0) return 0;
  const buysByCondition = new Map<string, { size: number; cost: number }>();
  const sellsByCondition = new Map<string, { size: number; proceeds: number }>();

  for (const t of trades) {
    if (t.side === "BUY") {
      const prev = buysByCondition.get(t.conditionId) ?? { size: 0, cost: 0 };
      prev.size += t.size;
      prev.cost += t.usdcSize;
      buysByCondition.set(t.conditionId, prev);
    } else if (t.side === "SELL") {
      const prev = sellsByCondition.get(t.conditionId) ?? { size: 0, proceeds: 0 };
      prev.size += t.size;
      prev.proceeds += t.usdcSize;
      sellsByCondition.set(t.conditionId, prev);
    }
  }

  let winningMarkets = 0;
  let totalMarkets = 0;
  for (const [cond, buy] of buysByCondition) {
    const sell = sellsByCondition.get(cond);
    if (!sell) continue;
    totalMarkets++;
    const avgBuy = buy.cost / buy.size;
    const avgSell = sell.proceeds / sell.size;
    if (avgSell > avgBuy) winningMarkets++;
  }

  return totalMarkets > 0 ? winningMarkets / totalMarkets : 0;
}

function computeConsistency(trades: ActivityEntry[]): number {
  if (trades.length < 10) return 0;
  const weekly = new Map<number, number>();
  for (const t of trades) {
    const week = Math.floor(t.timestamp / (7 * 24 * 3600));
    const signed = t.side === "BUY" ? -t.usdcSize : t.usdcSize;
    weekly.set(week, (weekly.get(week) ?? 0) + signed);
  }
  const values = Array.from(weekly.values());
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  return std > 0 ? mean / std : 0;
}

function computeMarketBreadth(trades: ActivityEntry[]): number {
  return new Set(trades.map((t) => t.conditionId)).size;
}

function computeAvgHoldPeriodHrs(trades: ActivityEntry[]): number {
  const entries = new Map<string, number>();
  const holds: number[] = [];

  for (const t of [...trades].sort((a, b) => a.timestamp - b.timestamp)) {
    if (t.side === "BUY" && !entries.has(t.conditionId)) {
      entries.set(t.conditionId, t.timestamp);
    } else if (t.side === "SELL") {
      const entry = entries.get(t.conditionId);
      if (entry) {
        holds.push((t.timestamp - entry) / 3600);
        entries.delete(t.conditionId);
      }
    }
  }

  if (holds.length === 0) return 0;
  holds.sort((a, b) => a - b);
  return holds[Math.floor(holds.length / 2)]!;
}

function countRecentTrades(trades: ActivityEntry[], daysBack: number): number {
  const cutoff = Math.floor(Date.now() / 1000) - daysBack * 24 * 3600;
  return trades.filter((t) => t.timestamp >= cutoff).length;
}

function computeCompositeScore(
  scored: Omit<WalletScore, "compositeScore">,
  max: { pnl: number; winRate: number; breadth: number; consistency: number; activity: number },
  weights: UniverseConfig["weights"],
): number {
  const norm = {
    pnl: max.pnl > 0 ? scored.leaderboardPnl / max.pnl : 0,
    winRate: scored.winRate,
    breadth: max.breadth > 0 ? scored.marketBreadth / max.breadth : 0,
    consistency: max.consistency > 0 ? Math.max(0, scored.consistency / max.consistency) : 0,
    activity: max.activity > 0 ? scored.tradesLast7d / max.activity : 0,
  };
  return (
    weights.pnl * norm.pnl +
    weights.winRate * norm.winRate +
    weights.breadth * norm.breadth +
    weights.consistency * norm.consistency +
    weights.activity * norm.activity
  );
}

export async function refreshUniverse(
  config: UniverseConfig = DEFAULT_CONFIG,
): Promise<WalletScore[]> {
  logger.info("Refreshing followed wallet universe...");
  const env = getEnv();
  config.targetFollowCount = env.FOLLOWED_WALLET_COUNT;

  const board = await fetchLeaderboard("all", config.topLeaderboardCount);
  logger.info({ count: board.length }, "Leaderboard fetched");

  const candidates: Array<Omit<WalletScore, "compositeScore">> = [];
  const lookbackStart = Math.floor(Date.now() / 1000) - config.activityLookbackDays * 24 * 3600;

  for (const entry of board) {
    try {
      const trades = await fetchActivity(entry.proxyWallet, {
        type: "TRADE",
        start: lookbackStart,
        limit: 1000,
      });

      if (trades.length === 0) continue;

      const botProbability = detectBotProbability(trades);
      const marketBreadth = computeMarketBreadth(trades);
      const tradesLast7d = countRecentTrades(trades, 7);

      if (botProbability > config.maxBotProbability) continue;
      if (marketBreadth < config.minMarketBreadth) continue;
      if (tradesLast7d < config.minTradesLast7d) continue;

      const balance = await fetchWalletBalance(entry.proxyWallet);

      candidates.push({
        address: entry.proxyWallet,
        username: entry.username,
        leaderboardRank: entry.rank,
        leaderboardPnl: entry.pnl,
        winRate: computeWinRate(trades),
        marketBreadth,
        consistency: computeConsistency(trades),
        avgHoldPeriodHrs: computeAvgHoldPeriodHrs(trades),
        maxDrawdown30d: 0,
        tradesLast7d,
        botProbability,
        cachedBalanceUsdc: balance,
      });

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 150));
    } catch (err) {
      logger.warn({ err, address: entry.proxyWallet }, "Failed to score wallet");
    }
  }

  const max = {
    pnl: Math.max(...candidates.map((c) => c.leaderboardPnl), 1),
    winRate: 1,
    breadth: Math.max(...candidates.map((c) => c.marketBreadth), 1),
    consistency: Math.max(...candidates.map((c) => c.consistency), 1),
    activity: Math.max(...candidates.map((c) => c.tradesLast7d), 1),
  };

  const scored: WalletScore[] = candidates
    .map((c) => ({
      ...c,
      compositeScore: computeCompositeScore(c, max, config.weights),
    }))
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, config.targetFollowCount);

  await persistUniverse(scored);

  logger.info(
    { count: scored.length, top3: scored.slice(0, 3).map((s) => s.address) },
    "Universe refreshed",
  );

  return scored;
}

async function persistUniverse(wallets: WalletScore[]): Promise<void> {
  const db = getDb();
  const now = BigInt(Date.now());

  for (const w of wallets) {
    await db
      .insert(followedWallets)
      .values({
        address: w.address,
        username: w.username,
        leaderboardRank: w.leaderboardRank,
        compositeScore: w.compositeScore,
        leaderboardPnl: w.leaderboardPnl,
        winRate: w.winRate,
        marketBreadth: w.marketBreadth,
        tradesLast7d: w.tradesLast7d,
        botProbability: w.botProbability,
        cachedBalanceUsdc: w.cachedBalanceUsdc,
        sizingMultiplier: 1.0,
        status: "TRACKING",
        addedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: followedWallets.address,
        set: {
          leaderboardRank: w.leaderboardRank,
          compositeScore: w.compositeScore,
          leaderboardPnl: w.leaderboardPnl,
          winRate: w.winRate,
          marketBreadth: w.marketBreadth,
          tradesLast7d: w.tradesLast7d,
          botProbability: w.botProbability,
          cachedBalanceUsdc: w.cachedBalanceUsdc,
          updatedAt: now,
        },
      });
  }
}

export async function loadTrackedWallets(): Promise<WalletScore[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(followedWallets)
    .where(eq(followedWallets.status, "TRACKING"));

  return rows.map((r) => ({
    address: r.address,
    username: r.username,
    leaderboardRank: r.leaderboardRank ?? 0,
    leaderboardPnl: r.leaderboardPnl ?? 0,
    winRate: r.winRate ?? 0,
    marketBreadth: r.marketBreadth ?? 0,
    consistency: 0,
    avgHoldPeriodHrs: 0,
    maxDrawdown30d: 0,
    tradesLast7d: r.tradesLast7d ?? 0,
    botProbability: r.botProbability ?? 0,
    compositeScore: r.compositeScore ?? 0,
    cachedBalanceUsdc: r.cachedBalanceUsdc ?? 0,
  }));
}

export async function addWallet(address: string, sizingMultiplier: number = 1.0): Promise<void> {
  const db = getDb();
  const now = BigInt(Date.now());
  await db
    .insert(followedWallets)
    .values({
      address: address.toLowerCase(),
      username: null,
      leaderboardRank: 0,
      compositeScore: 0,
      leaderboardPnl: 0,
      winRate: 0,
      marketBreadth: 0,
      tradesLast7d: 0,
      botProbability: 0,
      cachedBalanceUsdc: 0,
      sizingMultiplier,
      status: "TRACKING",
      addedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: followedWallets.address,
      set: { sizingMultiplier, status: "TRACKING", updatedAt: now },
    });
}

export async function removeWallet(address: string): Promise<void> {
  const db = getDb();
  await db
    .update(followedWallets)
    .set({ status: "PAUSED", updatedAt: BigInt(Date.now()) })
    .where(eq(followedWallets.address, address.toLowerCase()));
}
