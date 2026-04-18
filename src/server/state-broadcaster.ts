import type { WebSocket } from "ws";
import { getRedis, getRedisSubscriber, REDIS_CHANNELS, REDIS_KEYS, getAppState } from "../persist/redis.js";
import { getDb } from "../persist/db.js";
import { copiedPositions, followedWallets, fills as fillsTable } from "../persist/schema.js";
import { eq, sql } from "drizzle-orm";
import { logger } from "../logger.js";

export interface DashboardMessage {
  type: "snapshot" | "fill" | "signal" | "risk" | "system";
  payload: unknown;
}

export class StateBroadcaster {
  private clients: Set<WebSocket> = new Set();
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private startTime = Date.now();

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on("close", () => this.clients.delete(ws));
    logger.info({ clientCount: this.clients.size }, "Dashboard client connected");
  }

  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  broadcast(msg: DashboardMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === 1) client.send(data);
    }
  }

  async start(): Promise<void> {
    const sub = getRedisSubscriber();

    const channels = Object.values(REDIS_CHANNELS);
    for (const ch of channels) {
      await sub.subscribe(ch);
    }

    sub.on("message", (channel, message) => {
      try {
        const payload = JSON.parse(message);
        if (channel === REDIS_CHANNELS.NEWS && payload.type === "signal") {
          this.broadcast({ type: "signal", payload });
        } else if (channel === REDIS_CHANNELS.FILLS) {
          this.broadcast({ type: "fill", payload });
        } else if (channel === REDIS_CHANNELS.RISK) {
          this.broadcast({ type: "risk", payload });
        } else if (channel === REDIS_CHANNELS.SYSTEM) {
          this.broadcast({ type: "system", payload });
        }
      } catch (err) {
        logger.error({ err, channel }, "Failed to broadcast message");
      }
    });

    this.snapshotTimer = setInterval(() => this.sendSnapshot(), 2000);
    logger.info("State broadcaster started");
  }

  stop(): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }

  private async sendSnapshot(): Promise<void> {
    if (this.clients.size === 0) return;

    try {
      const redis = getRedis();
      const db = getDb();
      const appState = await getAppState();

      const portfolioRaw = await redis.get(REDIS_KEYS.PORTFOLIO);
      const portfolio = portfolioRaw ? JSON.parse(portfolioRaw) : {
        totalEquityUsdc: 0,
        totalDeployedUsdc: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
      };

      const wallets = await db
        .select()
        .from(followedWallets)
        .where(eq(followedWallets.status, "TRACKING"));

      const openPositions = await db
        .select()
        .from(copiedPositions)
        .where(eq(copiedPositions.status, "OPEN"));

      const wallet_states = wallets.map((w) => ({
        address: w.address,
        username: w.username,
        rank: w.leaderboardRank ?? 0,
        composite_score: w.compositeScore ?? 0,
        their_pnl_30d: w.leaderboardPnl ?? 0,
        our_active_copies: openPositions.filter((p) => p.whaleAddress === w.address).length,
        our_pnl_from_wallet: 0,
        last_trade_ts: 0,
        status: w.status,
      }));

      const positions = openPositions.map((p) => {
        const holdSec = Math.floor((Date.now() - Number(p.openedAt)) / 1000);
        const ourEntry = Number(p.ourEntryPrice ?? p.whaleEntryPrice);
        const mark = ourEntry;
        const shares = Number(p.sizeShares ?? 0);
        const unrealized = p.side === "BUY"
          ? (mark - ourEntry) * shares
          : (ourEntry - mark) * shares;
        const sizeUsdc = Number(p.sizeUsdc);
        return {
          copy_id: p.copyId,
          market_slug: p.conditionId,
          market_name: p.conditionId,
          side: p.side,
          copied_from: p.whaleAddress,
          copied_from_name: null,
          our_entry_price: ourEntry,
          whale_entry_price: Number(p.whaleEntryPrice),
          current_price: mark,
          size_usdc: sizeUsdc,
          unrealized_pnl_usdc: unrealized,
          unrealized_pnl_pct: sizeUsdc > 0 ? unrealized / sizeUsdc : 0,
          trailing_stop_price: p.trailingStopPrice ? Number(p.trailingStopPrice) : null,
          hold_time_s: holdSec,
        };
      });

      const totalEquity = portfolio.totalEquityUsdc ?? 0;
      const snapshot = {
        status: appState.mode,
        equity_usdc: totalEquity,
        daily_pnl_usdc: portfolio.realizedPnl + portfolio.unrealizedPnl,
        daily_pnl_pct: totalEquity > 0 ? (portfolio.realizedPnl + portfolio.unrealizedPnl) / totalEquity : 0,
        cumulative_pnl_usdc: portfolio.realizedPnl + portfolio.unrealizedPnl,
        drawdown_pct: 0,
        uptime_s: Math.floor((Date.now() - this.startTime) / 1000),
        last_heartbeat_ts: Date.now(),
        followed_wallets: wallet_states,
        positions,
        system: {
          postgres_connected: true,
          redis_connected: true,
        },
      };

      this.broadcast({ type: "snapshot", payload: snapshot });
    } catch (err) {
      logger.error({ err }, "Failed to assemble snapshot");
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
