import { fetchActivity, type ActivityEntry } from "../data/activity.js";
import { fetchMarketById } from "../gamma/client.js";
import { markSeen } from "./dedup.js";
import type { TradeSignal } from "./signal.js";
import { getRedis } from "../persist/redis.js";
import { logger } from "../logger.js";

const LAST_SEEN_KEY = (addr: string) => `wallet:lastSeen:${addr}`;
const FAST_POLL_MS = 10_000;
const SLOW_POLL_MS = 60_000;
const FAST_THRESHOLD_SEC = 24 * 3600;

interface TrackedWallet {
  address: string;
  username: string | null;
  tier: "FAST" | "SLOW";
  lastPolledAt: number;
  lastTradeAt: number;
}

export class ActivityPoller {
  private wallets: Map<string, TrackedWallet> = new Map();
  private onSignal: ((s: TradeSignal) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  setWallets(wallets: Array<{ address: string; username: string | null }>): void {
    const addrs = new Set(wallets.map((w) => w.address.toLowerCase()));

    for (const w of wallets) {
      const addr = w.address.toLowerCase();
      if (!this.wallets.has(addr)) {
        this.wallets.set(addr, {
          address: addr,
          username: w.username,
          tier: "FAST",
          lastPolledAt: 0,
          lastTradeAt: 0,
        });
      } else {
        const existing = this.wallets.get(addr)!;
        existing.username = w.username;
      }
    }

    for (const addr of Array.from(this.wallets.keys())) {
      if (!addrs.has(addr)) this.wallets.delete(addr);
    }

    logger.info({ count: this.wallets.size }, "Poller wallet set updated");
  }

  onNewSignal(handler: (s: TradeSignal) => void): void {
    this.onSignal = handler;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000);
    logger.info("Activity poller started");
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    const now = Date.now();

    for (const wallet of this.wallets.values()) {
      const interval = wallet.tier === "FAST" ? FAST_POLL_MS : SLOW_POLL_MS;
      if (now - wallet.lastPolledAt < interval) continue;
      wallet.lastPolledAt = now;
      this.pollWallet(wallet).catch((err) => {
        logger.error({ err, address: wallet.address }, "Poll error");
      });
    }
  }

  private async pollWallet(wallet: TrackedWallet): Promise<void> {
    const redis = getRedis();
    const lastSeenRaw = await redis.get(LAST_SEEN_KEY(wallet.address));
    const lastSeen = lastSeenRaw ? parseInt(lastSeenRaw, 10) : Math.floor(Date.now() / 1000) - 300;

    const trades = await fetchActivity(wallet.address, {
      type: "TRADE",
      start: lastSeen + 1,
      limit: 100,
    });

    if (trades.length === 0) {
      // Demote to SLOW if idle for 24h
      if (Date.now() / 1000 - wallet.lastTradeAt > FAST_THRESHOLD_SEC) {
        wallet.tier = "SLOW";
      }
      return;
    }

    let maxTs = lastSeen;
    for (const trade of trades) {
      if (!trade.transactionHash || trade.size === 0) continue;
      maxTs = Math.max(maxTs, trade.timestamp);

      const newSignal = await markSeen(trade.transactionHash);
      if (!newSignal) continue;

      const signal = await this.enrichSignal(trade, wallet);
      if (signal && this.onSignal) {
        try {
          this.onSignal(signal);
        } catch (err) {
          logger.error({ err }, "Signal handler error");
        }
      }
    }

    await redis.set(LAST_SEEN_KEY(wallet.address), String(maxTs));
    wallet.lastTradeAt = maxTs;
    wallet.tier = "FAST";
  }

  private async enrichSignal(
    trade: ActivityEntry,
    wallet: TrackedWallet,
  ): Promise<TradeSignal | null> {
    if (!trade.side) return null;

    let marketEndDate: string | null = null;
    let category = "";
    let negRisk = false;

    try {
      if (trade.conditionId) {
        const market = await fetchMarketById(trade.conditionId);
        if (market) {
          marketEndDate = market.endDate;
          category = market.category;
          negRisk = market.negRisk;
        }
      }
    } catch {
      // Non-fatal
    }

    return {
      transactionHash: trade.transactionHash,
      whaleAddress: wallet.address,
      whaleUsername: wallet.username,
      timestamp: trade.timestamp,
      side: trade.side,
      conditionId: trade.conditionId,
      tokenId: trade.asset,
      outcome: trade.outcome,
      outcomeIndex: trade.outcomeIndex,
      price: trade.price,
      size: trade.size,
      usdcSize: trade.usdcSize,
      marketSlug: trade.slug,
      marketTitle: trade.title,
      marketEndDate,
      category,
      negRisk,
      source: "data-api",
      detectedAt: Date.now(),
    };
  }

  getStats(): {
    total: number;
    fast: number;
    slow: number;
  } {
    let fast = 0;
    let slow = 0;
    for (const w of this.wallets.values()) {
      if (w.tier === "FAST") fast++;
      else slow++;
    }
    return { total: this.wallets.size, fast, slow };
  }
}
