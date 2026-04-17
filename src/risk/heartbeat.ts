import { CLOB_BASE_URL } from "../config/index.js";
import { getRedis, REDIS_CHANNELS } from "../persist/redis.js";
import { logger } from "../logger.js";

const PING_INTERVAL_MS = 5_000;
const MAX_CONSECUTIVE_FAILURES = 2;
const DISCONNECT_THRESHOLD_MS = 10_000;

export class ClobHeartbeat {
  private consecutiveFailures = 0;
  private lastSuccessTs = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;
  private onFallbackCancel: (() => Promise<void>) | null = null;

  setFallbackHandler(handler: () => Promise<void>): void {
    this.onFallbackCancel = handler;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.ping(), PING_INTERVAL_MS);
    logger.info("CLOB heartbeat started");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async ping(): Promise<void> {
    try {
      const start = Date.now();
      const res = await fetch(`${CLOB_BASE_URL}/ok`, {
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const latency = Date.now() - start;
        this.consecutiveFailures = 0;
        this.lastSuccessTs = Date.now();

        const redis = getRedis();
        await redis.publish(
          REDIS_CHANNELS.SYSTEM,
          JSON.stringify({ type: "heartbeat", latency, timestamp: Date.now() }),
        );
        return;
      }

      this.handleFailure(res.status);
    } catch (err) {
      this.handleFailure(0);
    }
  }

  private async handleFailure(statusCode: number): Promise<void> {
    this.consecutiveFailures++;
    const disconnectDuration = Date.now() - this.lastSuccessTs;

    logger.warn(
      {
        consecutiveFailures: this.consecutiveFailures,
        statusCode,
        disconnectMs: disconnectDuration,
      },
      "CLOB heartbeat failure",
    );

    const redis = getRedis();
    await redis.publish(
      REDIS_CHANNELS.RISK,
      JSON.stringify({
        type: "HEARTBEAT_FAILURE",
        consecutiveFailures: this.consecutiveFailures,
        disconnectMs: disconnectDuration,
        timestamp: Date.now(),
      }),
    );

    if (
      this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES &&
      disconnectDuration >= DISCONNECT_THRESHOLD_MS &&
      this.onFallbackCancel
    ) {
      logger.error(
        "CLOB disconnect > 10s with 2+ failures — initiating on-chain fallback cancel",
      );
      try {
        await this.onFallbackCancel();
      } catch (err) {
        logger.error({ err }, "On-chain fallback cancel failed");
      }
    }
  }

  getLastSuccessTs(): number {
    return this.lastSuccessTs;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }
}
