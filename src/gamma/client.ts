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

  // Fall back to clobTokenIds — may be a comma-separated string or array of strings
  const clobIds = raw.clobTokenIds;
  if (typeof clobIds === "string" && clobIds.length > 0) {
    return clobIds.split(",").map((id, i) => ({
      token_id: id.trim(),
      outcome: i === 0 ? "Yes" : "No",
      price: 0,
    }));
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

function parseRewards(raw: unknown): GammaMarket["rewards"] {
  if (!raw || typeof raw !== "object") return null;

  // Gamma may return rewards as a JSON string
  let parsed = raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const dailyRate = Number(parsed.dailyRate ?? parsed.daily_rate ?? 0);
  if (dailyRate === 0) return null;

  return {
    dailyRate,
    maxIncentiveSpread: Number(parsed.maxIncentiveSpread ?? parsed.max_incentive_spread ?? 0),
    minIncentiveSize: Number(parsed.minIncentiveSize ?? parsed.min_incentive_size ?? 0),
  };
}

function parseGammaMarket(raw: Record<string, unknown>): GammaMarket {
  return {
    id: String(raw.id ?? ""),
    conditionId: String(raw.conditionId ?? raw.condition_id ?? ""),
    slug: String(raw.slug ?? ""),
    question: String(raw.question ?? ""),
    category: String(raw.category ?? ""),
    endDate: String(raw.endDate ?? raw.end_date_iso ?? ""),
    active: Boolean(raw.active),
    closed: Boolean(raw.closed),
    negRisk: Boolean(raw.negRisk ?? raw.neg_risk),
    tokens: parseTokens(raw),
    rewards: parseRewards(raw.rewards),
    volume: Number(raw.volume ?? 0),
    liquidity: Number(raw.liquidity ?? 0),
  };
}
