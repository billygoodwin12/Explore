import Redis from "ioredis";
import { getEnv } from "../config/index.js";
import { logger } from "../logger.js";

let _redis: Redis | null = null;
let _sub: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;
  const env = getEnv();
  _redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
  _redis.on("connect", () => logger.info("Redis connected"));
  _redis.on("error", (err) => logger.error({ err }, "Redis error"));
  return _redis;
}

export function getRedisSubscriber(): Redis {
  if (_sub) return _sub;
  const env = getEnv();
  _sub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
  return _sub;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    _redis.disconnect();
    _redis = null;
  }
  if (_sub) {
    _sub.disconnect();
    _sub = null;
  }
  logger.info("Redis connections closed");
}

export const REDIS_CHANNELS = {
  FILLS: "fills",
  QUOTES: "quotes",
  RISK: "risk",
  NEWS: "news",
  SYSTEM: "system",
} as const;

export const REDIS_KEYS = {
  APP_STATE: "appState",
  UNIVERSE: "universe",
  MARKET_STATE: (slug: string) => `market:${slug}`,
  PORTFOLIO: "portfolio",
  REWARDS: "rewards",
  SYSTEM_HEALTH: "systemHealth",
} as const;

export interface AppState {
  halted: boolean;
  reason: string | null;
  mode: "LIVE" | "PAPER" | "HALTED" | "COOLDOWN";
  pausedAt: number | null;
}

export async function getAppState(): Promise<AppState> {
  const redis = getRedis();
  const raw = await redis.get(REDIS_KEYS.APP_STATE);
  if (!raw) {
    return { halted: false, reason: null, mode: "PAPER", pausedAt: null };
  }
  return JSON.parse(raw) as AppState;
}

export async function setAppState(state: AppState): Promise<void> {
  const redis = getRedis();
  await redis.set(REDIS_KEYS.APP_STATE, JSON.stringify(state));
  await redis.publish(REDIS_CHANNELS.SYSTEM, JSON.stringify({ type: "stateChange", state }));
}
