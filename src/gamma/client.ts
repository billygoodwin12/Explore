import { GAMMA_BASE_URL } from "../config/index.js";
import { logger } from "../logger.js";

export interface GammaMarket {
  id: string;
  conditionId: string;
  slug: string;
  question: string;
  category: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  negRisk: boolean;
  tokens: Array<{
    token_id: string;
    outcome: string;
    price: number;
  }>;
  rewards: {
    dailyRate: number;
    maxIncentiveSpread: number;
    minIncentiveSize: number;
  } | null;
  volume: number;
  liquidity: number;
}

export async function fetchActiveMarkets(
  limit: number = 500,
): Promise<GammaMarket[]> {
  const url = `${GAMMA_BASE_URL}/markets?active=true&closed=false&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Gamma markets fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data.map(parseGammaMarket);
}

export async function fetchMarketBySlug(
  slug: string,
): Promise<GammaMarket | null> {
  const url = `${GAMMA_BASE_URL}/markets?slug=${encodeURIComponent(slug)}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as Array<Record<string, unknown>>;
  if (data.length === 0) return null;
  return parseGammaMarket(data[0]!);
}

export async function fetchMarketById(
  conditionId: string,
): Promise<GammaMarket | null> {
  const url = `${GAMMA_BASE_URL}/markets?id=${conditionId}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as Array<Record<string, unknown>>;
  if (data.length === 0) return null;
  return parseGammaMarket(data[0]!);
}

function parseTokens(raw: Record<string, unknown>): Array<{ token_id: string; outcome: string; price: number }> {
  let tokensRaw = raw.tokens;

  // Gamma may return tokens as a JSON string
  if (typeof tokensRaw === "string") {
    try {
      tokensRaw = JSON.parse(tokensRaw);
    } catch {
      tokensRaw = null;
    }
  }

  // If tokens is an array of objects, use it directly
  if (Array.isArray(tokensRaw)) {
    return tokensRaw.map((t: Record<string, unknown>) => ({
      token_id: String(t.token_id ?? t.tokenId ?? ""),
      outcome: String(t.outcome ?? ""),
      price: Number(t.price ?? 0),
    }));
  }

  // Fall back to clobTokenIds — JSON string array like '["id1", "id2"]'
  const clobIds = raw.clobTokenIds;
  if (typeof clobIds === "string" && clobIds.length > 0) {
    try {
      const parsed = JSON.parse(clobIds) as string[];
      if (Array.isArray(parsed)) {
        const outcomes = raw.outcomes ? JSON.parse(String(raw.outcomes)) as string[] : [];
        const prices = raw.outcomePrices ? JSON.parse(String(raw.outcomePrices)) as string[] : [];
        return parsed.map((id, i) => ({
          token_id: String(id),
          outcome: outcomes[i] ?? (i === 0 ? "Yes" : "No"),
          price: prices[i] ? parseFloat(prices[i]!) : 0,
        }));
      }
    } catch {
      // fall through
    }
  }
  if (Array.isArray(clobIds)) {
    return clobIds.map((id: unknown, i: number) => ({
      token_id: String(id),
      outcome: i === 0 ? "Yes" : "No",
      price: 0,
    }));
  }

  return [];
}

function parseRewards(raw: Record<string, unknown>): GammaMarket["rewards"] {
  // Gamma has rewards as top-level fields: clobRewards, rewardsMinSize, rewardsMaxSpread
  const clobRewards = raw.clobRewards;
  const rewardsMaxSpread = Number(raw.rewardsMaxSpread ?? 0);
  const rewardsMinSize = Number(raw.rewardsMinSize ?? 0);

  // clobRewards might be a nested object or a JSON string
  let dailyRate = 0;
  if (clobRewards && typeof clobRewards === "object") {
    dailyRate = Number((clobRewards as Record<string, unknown>).dailyRate ?? 0);
  } else if (typeof clobRewards === "string") {
    try {
      const parsed = JSON.parse(clobRewards);
      dailyRate = Number(parsed.dailyRate ?? 0);
    } catch {}
  } else if (typeof clobRewards === "number") {
    dailyRate = clobRewards;
  }

  // Also check for a nested rewards object
  if (dailyRate === 0 && raw.rewards) {
    let rewardsObj = raw.rewards as Record<string, unknown>;
    if (typeof raw.rewards === "string") {
      try { rewardsObj = JSON.parse(raw.rewards); } catch { return null; }
    }
    dailyRate = Number(rewardsObj.dailyRate ?? rewardsObj.daily_rate ?? 0);
    if (dailyRate > 0) {
      return {
        dailyRate,
        maxIncentiveSpread: Number(rewardsObj.maxIncentiveSpread ?? rewardsObj.max_incentive_spread ?? rewardsMaxSpread ?? 0),
        minIncentiveSize: Number(rewardsObj.minIncentiveSize ?? rewardsObj.min_incentive_size ?? rewardsMinSize ?? 0),
      };
    }
  }

  if (rewardsMaxSpread === 0 && rewardsMinSize === 0 && dailyRate === 0) return null;

  return {
    dailyRate,
    maxIncentiveSpread: rewardsMaxSpread,
    minIncentiveSize: rewardsMinSize,
  };
}

function parseGammaMarket(raw: Record<string, unknown>): GammaMarket {
  return {
    id: String(raw.id ?? ""),
    conditionId: String(raw.conditionId ?? raw.condition_id ?? ""),
    slug: String(raw.slug ?? ""),
    question: String(raw.question ?? ""),
    category: String(raw.category ?? ""),
    endDate: String(raw.endDate ?? raw.endDateIso ?? raw.end_date_iso ?? ""),
    active: Boolean(raw.active),
    closed: Boolean(raw.closed),
    negRisk: Boolean(raw.negRisk ?? raw.neg_risk),
    tokens: parseTokens(raw),
    rewards: parseRewards(raw),
    volume: Number(raw.volumeNum ?? raw.volume ?? 0),
    liquidity: Number(raw.liquidityNum ?? raw.liquidity ?? 0),
  };
}
