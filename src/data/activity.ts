import { DATA_BASE_URL } from "../config/index.js";
import { logger } from "../logger.js";

export interface ActivityEntry {
  transactionHash: string;
  timestamp: number;
  user: string;
  type: string;
  side: "BUY" | "SELL" | null;
  conditionId: string;
  asset: string;
  outcome: string;
  outcomeIndex: number;
  price: number;
  size: number;
  usdcSize: number;
  title: string;
  slug: string;
  eventSlug: string;
  icon: string | null;
}

export async function fetchActivity(
  address: string,
  opts: {
    type?: "TRADE" | "SPLIT" | "MERGE" | "REDEEM";
    start?: number;
    limit?: number;
  } = {},
): Promise<ActivityEntry[]> {
  const params = new URLSearchParams();
  params.set("user", address);
  if (opts.type) params.set("type", opts.type);
  if (opts.start !== undefined) params.set("start", String(opts.start));
  params.set("limit", String(opts.limit ?? 500));
  params.set("sortDirection", "ASC");

  const url = `${DATA_BASE_URL}/activity?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Activity fetch failed for ${address}: ${res.status}`);
  }

  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data.map((row) => ({
    transactionHash: String(row.transactionHash ?? row.transaction_hash ?? ""),
    timestamp: Number(row.timestamp ?? 0),
    user: String(row.user ?? row.proxyWallet ?? address),
    type: String(row.type ?? ""),
    side: normalizeSide(row.side),
    conditionId: String(row.conditionId ?? row.condition_id ?? ""),
    asset: String(row.asset ?? row.tokenId ?? ""),
    outcome: String(row.outcome ?? ""),
    outcomeIndex: Number(row.outcomeIndex ?? row.outcome_index ?? 0),
    price: Number(row.price ?? 0),
    size: Number(row.size ?? 0),
    usdcSize: Number(row.usdcSize ?? row.usdc_size ?? 0),
    title: String(row.title ?? row.question ?? ""),
    slug: String(row.slug ?? ""),
    eventSlug: String(row.eventSlug ?? row.event_slug ?? ""),
    icon: (row.icon as string | null) ?? null,
  }));
}

function normalizeSide(v: unknown): "BUY" | "SELL" | null {
  if (typeof v !== "string") return null;
  const s = v.toUpperCase();
  if (s === "BUY" || s === "SELL") return s;
  return null;
}
