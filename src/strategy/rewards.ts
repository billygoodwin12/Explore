/**
 * Reward formula per docs.polymarket.com/market-makers/liquidity-rewards
 * Quadratic spread penalty, two-sided bonus.
 */

export interface RewardParams {
  quoteSize: number;
  spreadBps: number;
  maxIncentiveSpreadBps: number;
  minIncentiveSize: number;
  bidSize: number;
  askSize: number;
  dailyRate: number;
}

export function computeQScore(
  bidSize: number,
  askSize: number,
  minSize: number,
): number {
  const c = 2;
  const qOne = Math.min(bidSize, askSize);
  const qTwo = Math.max(bidSize, askSize);
  const twoSided = Math.max(
    Math.min(qOne, qTwo),
    Math.max(qOne / c, qTwo / c),
  );
  return Math.max(twoSided, 0);
}

export function computeSpreadPenalty(
  spreadBps: number,
  maxIncentiveSpreadBps: number,
): number {
  if (spreadBps > maxIncentiveSpreadBps) return 0;
  const ratio = spreadBps / maxIncentiveSpreadBps;
  return (1 - ratio * ratio);
}

export function computeRewardScore(params: RewardParams): number {
  const { bidSize, askSize, minIncentiveSize, spreadBps, maxIncentiveSpreadBps } = params;

  if (spreadBps > maxIncentiveSpreadBps) return 0;
  if (bidSize < minIncentiveSize && askSize < minIncentiveSize) return 0;

  const qScore = computeQScore(bidSize, askSize, minIncentiveSize);
  const spreadPenalty = computeSpreadPenalty(spreadBps, maxIncentiveSpreadBps);

  return qScore * spreadPenalty;
}

export function estimateDailyReward(
  myScore: number,
  totalMarketScore: number,
  dailyPoolUsdc: number,
): number {
  if (totalMarketScore === 0) return 0;
  return (myScore / totalMarketScore) * dailyPoolUsdc;
}

export function expectedRewardPerUsd(
  params: RewardParams,
  totalMarketScore: number,
  capitalDeployed: number,
): number {
  if (capitalDeployed === 0) return 0;
  const score = computeRewardScore(params);
  const dailyReward = estimateDailyReward(score, totalMarketScore, params.dailyRate);
  return dailyReward / capitalDeployed;
}
