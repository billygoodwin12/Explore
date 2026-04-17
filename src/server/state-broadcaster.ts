import type { WebSocket } from "ws";
import { getRedis, getRedisSubscriber, REDIS_CHANNELS, REDIS_KEYS, getAppState } from "../persist/redis.js";
import { logger } from "../logger.js";

export interface DashboardMessage {
  type: "snapshot" | "fill" | "news" | "risk" | "system";
  payload: unknown;
}

export class StateBroadcaster {
  private clients: Set<WebSocket> = new Set();
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private startTime = Date.now();

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on("close", () => this.clients.delete(ws));
    logger.info(
      { clientCount: this.clients.size },
      "Dashboard client connected",
    );
  }

  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  broadcast(msg: DashboardMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(data);
      }
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
        const typeMap: Record<string, DashboardMessage["type"]> = {
          [REDIS_CHANNELS.FILLS]: "fill",
          [REDIS_CHANNELS.NEWS]: "news",
          [REDIS_CHANNELS.RISK]: "risk",
          [REDIS_CHANNELS.SYSTEM]: "system",
          [REDIS_CHANNELS.QUOTES]: "system",
        };

        const type = typeMap[channel] ?? "system";
        this.broadcast({ type, payload });
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
      const appState = await getAppState();

      const [universeRaw, portfolioRaw, rewardsRaw, healthRaw] =
        await Promise.all([
          redis.get(REDIS_KEYS.UNIVERSE),
          redis.get(REDIS_KEYS.PORTFOLIO),
          redis.get(REDIS_KEYS.REWARDS),
          redis.get(REDIS_KEYS.SYSTEM_HEALTH),
        ]);

      const universe = universeRaw ? JSON.parse(universeRaw) : [];
      const portfolio = portfolioRaw
        ? JSON.parse(portfolioRaw)
        : { equity_usdc: 0, daily_pnl_usdc: 0, daily_pnl_pct: 0, cumulative_pnl_usdc: 0 };
      const rewards = rewardsRaw
        ? JSON.parse(rewardsRaw)
        : { est_today_usdc: 0, history_7d: [], cumulative_usdc: 0, annualized_yield_pct: 0 };
      const system = healthRaw
        ? JSON.parse(healthRaw)
        : {};

      const snapshot = {
        status: appState.mode,
        equity_usdc: portfolio.equity_usdc,
        daily_pnl_usdc: portfolio.daily_pnl_usdc,
        daily_pnl_pct: portfolio.daily_pnl_pct,
        cumulative_pnl_usdc: portfolio.cumulative_pnl_usdc,
        drawdown_pct: portfolio.drawdown_pct ?? 0,
        uptime_s: Math.floor((Date.now() - this.startTime) / 1000),
        last_heartbeat_ts: Date.now(),
        markets: universe,
        rewards,
        system,
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
