import type { InventoryState } from "../strategy/inventory.js";
import { getEnv } from "../config/index.js";

export interface Portfolio {
  totalEquityUsdc: number;
  totalAtRiskUsdc: number;
  inventories: Map<string, InventoryState>;
}

const PER_MARKET_CAP_PCT = 0.30;
const GLOBAL_CAP_PCT = 0.70;

export interface OrderCandidate {
  conditionId: string;
  side: "BUY" | "SELL";
  sizeUsdc: number;
}

export function canPlace(
  order: OrderCandidate,
  portfolio: Portfolio,
): { allowed: boolean; reason: string } {
  const env = getEnv();
  const maxCapital = env.MAX_CAPITAL_USDC;

  if (portfolio.totalAtRiskUsdc + order.sizeUsdc > maxCapital * GLOBAL_CAP_PCT) {
    return {
      allowed: false,
      reason: `Global cap exceeded: ${portfolio.totalAtRiskUsdc + order.sizeUsdc} > ${maxCapital * GLOBAL_CAP_PCT}`,
    };
  }

  const inv = portfolio.inventories.get(order.conditionId);
  if (inv) {
    const marketExposure = inv.capitalDeployed + order.sizeUsdc;
    const perMarketCap = maxCapital * PER_MARKET_CAP_PCT;
    if (marketExposure > perMarketCap) {
      return {
        allowed: false,
        reason: `Per-market cap exceeded: ${marketExposure} > ${perMarketCap}`,
      };
    }
  }

  if (portfolio.totalEquityUsdc <= 0) {
    return { allowed: false, reason: "No equity available" };
  }

  return { allowed: true, reason: "OK" };
}

export function computeTotalAtRisk(
  inventories: Map<string, InventoryState>,
): number {
  let total = 0;
  for (const inv of inventories.values()) {
    total += inv.capitalDeployed;
  }
  return total;
}
