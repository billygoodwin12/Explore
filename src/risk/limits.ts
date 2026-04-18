import { getEnv } from "../config/index.js";

export interface Portfolio {
  totalEquityUsdc: number;
  totalDeployedUsdc: number;
  openPositionsByMarket: Map<string, number>;
}

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
  const globalCapUsdc = env.MAX_CAPITAL_USDC * (env.MAX_CAPITAL_AT_RISK_PCT / 100);

  if (portfolio.totalDeployedUsdc + order.sizeUsdc > globalCapUsdc) {
    return {
      allowed: false,
      reason: `Global cap exceeded: ${portfolio.totalDeployedUsdc + order.sizeUsdc} > ${globalCapUsdc}`,
    };
  }

  const perMarket = portfolio.openPositionsByMarket.get(order.conditionId) ?? 0;
  if (perMarket >= env.MAX_BUYS_PER_TOKEN) {
    return {
      allowed: false,
      reason: `Per-market cap reached: ${perMarket}/${env.MAX_BUYS_PER_TOKEN}`,
    };
  }

  if (portfolio.totalEquityUsdc <= 0) {
    return { allowed: false, reason: "No equity available" };
  }

  return { allowed: true, reason: "OK" };
}
