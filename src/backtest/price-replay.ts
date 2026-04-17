import { fetchPriceHistory } from "../data/client.js";
import { computeMicropriceMid } from "../strategy/quoter.js";
import type { OrderBook } from "../clob/adapter.js";
import { logger } from "../logger.js";

export interface PriceReplayConfig {
  tokenId: string;
  from: number;
  to: number;
  plannedSpread: number;
  quoteSize: number;
}

export interface PriceReplayResult {
  ticks: number;
  theoreticalFills: number;
  spreadPnl: number;
  avgSpread: number;
  maxDrawdown: number;
}

export async function runPriceReplay(
  config: PriceReplayConfig,
): Promise<PriceReplayResult> {
  const history = await fetchPriceHistory(config.tokenId, "1h", 1000);
  const filteredHistory = history.filter(
    (p) => p.t >= config.from && p.t <= config.to,
  );

  if (filteredHistory.length < 2) {
    throw new Error("Insufficient price history for replay");
  }

  let spreadPnl = 0;
  let fills = 0;
  let maxDrawdown = 0;
  let peakPnl = 0;
  let totalSpread = 0;

  for (let i = 1; i < filteredHistory.length; i++) {
    const prevPrice = filteredHistory[i - 1]!.p;
    const curPrice = filteredHistory[i]!.p;
    const mid = (prevPrice + curPrice) / 2;

    const bidPrice = mid - config.plannedSpread / 2;
    const askPrice = mid + config.plannedSpread / 2;

    if (curPrice <= bidPrice) {
      spreadPnl += (mid - bidPrice) * config.quoteSize;
      fills++;
    }
    if (curPrice >= askPrice) {
      spreadPnl += (askPrice - mid) * config.quoteSize;
      fills++;
    }

    totalSpread += config.plannedSpread;
    peakPnl = Math.max(peakPnl, spreadPnl);
    maxDrawdown = Math.min(maxDrawdown, spreadPnl - peakPnl);
  }

  const result: PriceReplayResult = {
    ticks: filteredHistory.length,
    theoreticalFills: fills,
    spreadPnl,
    avgSpread: totalSpread / filteredHistory.length,
    maxDrawdown,
  };

  logger.info(result, "Price replay complete");
  return result;
}
