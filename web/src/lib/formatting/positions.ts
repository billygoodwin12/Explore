import type { MockPosition } from "@/lib/mock/types";

export function notional(p: MockPosition): number {
  return p.coins * p.markPrice;
}

export function unrealizedPnl(p: MockPosition): number {
  const sign = p.side === "long" ? 1 : -1;
  return p.coins * (p.markPrice - p.entryPrice) * sign;
}

export function unrealizedPnlBps(p: MockPosition): number {
  const cost = p.coins * p.entryPrice;
  if (cost === 0) return 0;
  return Math.round((unrealizedPnl(p) / cost) * 10_000);
}
