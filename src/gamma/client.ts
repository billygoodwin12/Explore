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

function parseGammaMarket(raw: Record<string, unknown>): GammaMarket {
  const rewards = raw.rewards as Record<string, unknown> | null;
  const tokens = (raw.tokens ?? raw.clobTokenIds ?? []) as Array<Record<string, unknown>>;

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
    tokens: tokens.map((t) => ({
      token_id: String(t.token_id ?? t.tokenId ?? ""),
      outcome: String(t.outcome ?? ""),
      price: Number(t.price ?? 0),
    })),
    rewards: rewards
      ? {
          dailyRate: Number(rewards.dailyRate ?? rewards.daily_rate ?? 0),
          maxIncentiveSpread: Number(
            rewards.maxIncentiveSpread ?? rewards.max_incentive_spread ?? 0,
          ),
          minIncentiveSize: Number(
            rewards.minIncentiveSize ?? rewards.min_incentive_size ?? 0,
          ),
        }
      : null,
    volume: Number(raw.volume ?? 0),
    liquidity: Number(raw.liquidity ?? 0),
  };
}
