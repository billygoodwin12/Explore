import { getEnv } from "../config/index.js";
import { logger } from "../logger.js";

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  publishedAt: string;
  categories: string[];
  entities: string[];
}

let accessToken: string | null = null;
let tokenExpiresAt = 0;

async function ensureToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;

  const env = getEnv();
  if (!env.ASKNEWS_CLIENT_ID || !env.ASKNEWS_CLIENT_SECRET) {
    throw new Error("AskNews credentials not configured — skipping news");
  }
  const res = await fetch("https://api.asknews.app/v1/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.ASKNEWS_CLIENT_ID,
      client_secret: env.ASKNEWS_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    throw new Error(`AskNews auth failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000 - 60_000;
  return accessToken;
}

export async function fetchBreakingNews(
  categories?: string[],
  limit: number = 20,
): Promise<NewsItem[]> {
  const token = await ensureToken();
  let url = `https://api.asknews.app/v1/news/search?limit=${limit}&sort=publishedAt:desc`;
  if (categories?.length) {
    url += `&categories=${categories.join(",")}`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`AskNews fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    results: Array<Record<string, unknown>>;
  };

  return data.results.map((r) => ({
    id: String(r.id ?? ""),
    headline: String(r.headline ?? r.title ?? ""),
    summary: String(r.summary ?? r.body ?? ""),
    source: String(r.source ?? ""),
    publishedAt: String(r.publishedAt ?? r.published_at ?? ""),
    categories: (r.categories ?? []) as string[],
    entities: (r.entities ?? []) as string[],
  }));
}

export class AskNewsPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private onNews: ((items: NewsItem[]) => void) | null = null;
  private lastSeenId: string | null = null;

  setHandler(handler: (items: NewsItem[]) => void): void {
    this.onNews = handler;
  }

  start(intervalMs: number = 30_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), intervalMs);
    this.poll();
    logger.info({ intervalMs }, "AskNews poller started");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const items = await fetchBreakingNews();
      const newItems = this.lastSeenId
        ? items.filter(
            (item) =>
              items.findIndex((i) => i.id === this.lastSeenId) === -1 ||
              items.indexOf(item) <
                items.findIndex((i) => i.id === this.lastSeenId),
          )
        : items;

      if (newItems.length > 0) {
        this.lastSeenId = newItems[0]!.id;
        this.onNews?.(newItems);
      }
    } catch (err) {
      logger.error({ err }, "AskNews poll error");
    }
  }
}
