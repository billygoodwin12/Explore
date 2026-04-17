import { getRedis, REDIS_KEYS } from "../persist/redis.js";
import { logger } from "../logger.js";

export interface InventoryState {
  conditionId: string;
  yesShares: number;
  noShares: number;
  netDeltaUsdc: number;
  capitalDeployed: number;
}

const PER_MARKET_CAP_PCT = 0.30;
const GLOBAL_CAP_PCT = 0.70;

export function canAcceptInventory(
  side: "YES" | "NO",
  addSize: number,
  current: InventoryState,
  maxCapitalPerMarket: number,
): boolean {
  const cap = maxCapitalPerMarket * PER_MARKET_CAP_PCT;
  if (side === "YES") {
    return current.yesShares + addSize <= cap;
  }
  return current.noShares + addSize <= cap;
}

export function inventoryRoom(
  side: "YES" | "NO",
  current: InventoryState,
  maxCapitalPerMarket: number,
): number {
  const cap = maxCapitalPerMarket * PER_MARKET_CAP_PCT;
  if (side === "YES") {
    return Math.max(0, cap - current.yesShares);
  }
  return Math.max(0, cap - current.noShares);
}

export function checkGlobalCap(
  totalAtRisk: number,
  totalCapital: number,
): boolean {
  return totalAtRisk <= totalCapital * GLOBAL_CAP_PCT;
}

export async function loadInventory(
  conditionId: string,
): Promise<InventoryState> {
  const redis = getRedis();
  const raw = await redis.get(REDIS_KEYS.MARKET_STATE(conditionId));
  if (!raw) {
    return {
      conditionId,
      yesShares: 0,
      noShares: 0,
      netDeltaUsdc: 0,
      capitalDeployed: 0,
    };
  }
  return JSON.parse(raw) as InventoryState;
}

export async function saveInventory(state: InventoryState): Promise<void> {
  const redis = getRedis();
  await redis.set(
    REDIS_KEYS.MARKET_STATE(state.conditionId),
    JSON.stringify(state),
  );
}

export function computeNetDelta(
  yesShares: number,
  noShares: number,
  midPrice: number,
): number {
  return (yesShares - noShares) * midPrice;
}
