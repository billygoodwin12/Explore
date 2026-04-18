import type { ClobAdapter } from "../clob/adapter.js";
import { getDb } from "../persist/db.js";
import { copiedPositions, pnlSnapshots } from "../persist/schema.js";
import { eq } from "drizzle-orm";
import { sellPosition } from "./exit-mirror.js";
import { getRedis, REDIS_KEYS } from "../persist/redis.js";
import { logger } from "../logger.js";

export interface PortfolioState {
  totalEquityUsdc: number;
  totalDeployedUsdc: number;
  openPositions: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export async function computePortfolioState(
  adapter: ClobAdapter,
  baseBalanceUsdc: number,
): Promise<PortfolioState> {
  const db = getDb();

  const openCopies = await db
    .select()
    .from(copiedPositions)
    .where(eq(copiedPositions.status, "OPEN"));

  const closedCopies = await db
    .select()
    .from(copiedPositions)
    .where(eq(copiedPositions.status, "CLOSED"));

  const realizedPnl = closedCopies.reduce(
    (sum, c) => sum + Number(c.realizedPnlUsdc ?? 0),
    0,
  );

  let unrealizedPnl = 0;
  let totalDeployed = 0;
  const tokenPriceCache = new Map<string, number>();

  for (const copy of openCopies) {
    totalDeployed += Number(copy.sizeUsdc);

    try {
      let markPrice = tokenPriceCache.get(copy.tokenId);
      if (markPrice === undefined) {
        const book = await adapter.getOrderBook(copy.tokenId);
        const bid = book.bids[0]?.price ?? 0;
        const ask = book.asks[0]?.price ?? 1;
        markPrice = (bid + ask) / 2;
        tokenPriceCache.set(copy.tokenId, markPrice);
      }

      const shares = Number(copy.sizeShares ?? 0);
      const ourEntry = Number(copy.ourEntryPrice ?? copy.whaleEntryPrice);
      const pnl = copy.side === "BUY"
        ? (markPrice - ourEntry) * shares
        : (ourEntry - markPrice) * shares;
      unrealizedPnl += pnl;
    } catch {
      // Skip on error
    }
  }

  const totalEquity = baseBalanceUsdc + unrealizedPnl + realizedPnl;

  const state: PortfolioState = {
    totalEquityUsdc: totalEquity,
    totalDeployedUsdc: totalDeployed,
    openPositions: openCopies.length,
    realizedPnl,
    unrealizedPnl,
  };

  const redis = getRedis();
  await redis.set(REDIS_KEYS.PORTFOLIO, JSON.stringify(state));

  return state;
}

export async function persistPnlSnapshot(state: PortfolioState): Promise<void> {
  const db = getDb();
  await db.insert(pnlSnapshots).values({
    timestamp: BigInt(Date.now()),
    totalEquityUsdc: state.totalEquityUsdc,
    realizedPnlUsdc: state.realizedPnl,
    unrealizedPnlUsdc: state.unrealizedPnl,
    openPositions: state.openPositions,
    totalDeployedUsdc: state.totalDeployedUsdc,
  });
}

export async function sellAllPositions(adapter: ClobAdapter, reason: string): Promise<number> {
  const db = getDb();
  const openCopies = await db
    .select()
    .from(copiedPositions)
    .where(eq(copiedPositions.status, "OPEN"));

  logger.warn({ count: openCopies.length, reason }, "Selling all open positions");

  let sold = 0;
  for (const copy of openCopies) {
    try {
      await sellPosition(copy, adapter, reason);
      sold++;
    } catch (err) {
      logger.error({ err, copyId: copy.copyId }, "Sell-all failure");
    }
  }

  return sold;
}
