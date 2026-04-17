import { getRedis, setAppState, getAppState, REDIS_CHANNELS, REDIS_KEYS } from "../persist/redis.js";
import { cancelAllOrders } from "../clob/orders.js";
import { logger } from "../logger.js";

const KILL_SWITCH_PCT = -0.05;

export interface EquitySnapshot {
  timestamp: number;
  equityUsdc: number;
}

let midnightEquity: number | null = null;
let currentEquity: number = 0;

export function setMidnightEquity(equity: number): void {
  midnightEquity = equity;
  currentEquity = equity;
  logger.info({ equity }, "Midnight equity snapshot set");
}

export function getMidnightEquity(): number | null {
  return midnightEquity;
}

export function updateCurrentEquity(equity: number): void {
  currentEquity = equity;
}

export function getCurrentDrawdownPct(): number {
  if (midnightEquity === null || midnightEquity === 0) return 0;
  return (currentEquity - midnightEquity) / midnightEquity;
}

export async function checkDrawdown(): Promise<boolean> {
  const dd = getCurrentDrawdownPct();

  if (dd <= KILL_SWITCH_PCT) {
    logger.error(
      { drawdown: dd, threshold: KILL_SWITCH_PCT, currentEquity, midnightEquity },
      "KILL SWITCH TRIGGERED — drawdown exceeded threshold",
    );

    const redis = getRedis();
    await redis.publish(
      REDIS_CHANNELS.RISK,
      JSON.stringify({
        type: "DRAWDOWN_KILL",
        drawdown: dd,
        currentEquity,
        midnightEquity,
        timestamp: Date.now(),
      }),
    );

    await setAppState({
      halted: true,
      reason: `Daily drawdown ${(dd * 100).toFixed(2)}% exceeded -5% threshold`,
      mode: "HALTED",
      pausedAt: Date.now(),
    });

    try {
      await cancelAllOrders();
    } catch (err) {
      logger.error({ err }, "Failed to cancel all orders during kill switch");
    }

    return true;
  }

  if (dd <= KILL_SWITCH_PCT * 0.6) {
    const redis = getRedis();
    await redis.publish(
      REDIS_CHANNELS.RISK,
      JSON.stringify({
        type: "DRAWDOWN_WARNING",
        drawdown: dd,
        timestamp: Date.now(),
      }),
    );
  }

  return false;
}

export function resetMidnightEquity(): void {
  midnightEquity = currentEquity;
  logger.info({ equity: currentEquity }, "Midnight equity reset (new UTC day)");
}
