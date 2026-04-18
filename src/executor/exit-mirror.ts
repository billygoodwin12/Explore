import type { TradeSignal } from "../tracker/signal.js";
import type { ClobAdapter } from "../clob/adapter.js";
import { getDb } from "../persist/db.js";
import { copiedPositions, exits } from "../persist/schema.js";
import { and, eq } from "drizzle-orm";
import { ORDER_SIDE } from "../clob/orders.js";
import { getRedis, REDIS_CHANNELS } from "../persist/redis.js";
import { getEnv } from "../config/index.js";
import { logger } from "../logger.js";

export async function handleWhaleExit(
  signal: TradeSignal,
  adapter: ClobAdapter,
): Promise<void> {
  const db = getDb();

  const ourCopies = await db
    .select()
    .from(copiedPositions)
    .where(
      and(
        eq(copiedPositions.whaleAddress, signal.whaleAddress),
        eq(copiedPositions.conditionId, signal.conditionId),
        eq(copiedPositions.status, "OPEN"),
      ),
    );

  if (ourCopies.length === 0) return;

  for (const copy of ourCopies) {
    if (copy.side === signal.side) continue;

    logger.warn(
      {
        copyId: copy.copyId,
        whale: signal.whaleAddress,
        market: signal.marketSlug,
      },
      "Mirroring whale exit",
    );

    try {
      await sellPosition(copy, adapter, "WHALE_EXIT", signal.transactionHash);
    } catch (err) {
      logger.error({ err, copyId: copy.copyId }, "Failed to mirror exit");
    }
  }
}

export async function sellPosition(
  copy: typeof copiedPositions.$inferSelect,
  adapter: ClobAdapter,
  exitType: string,
  whaleExitTxHash?: string,
): Promise<void> {
  const env = getEnv();
  const db = getDb();
  const shares = Number(copy.sizeShares ?? 0);
  if (shares <= 0) return;

  const book = await adapter.getOrderBook(copy.tokenId);
  const closeSide = copy.side === "BUY" ? "SELL" : "BUY";

  const bestPrice = closeSide === "SELL" ? book.bids[0]?.price : book.asks[0]?.price;
  if (!bestPrice) {
    logger.error({ copyId: copy.copyId }, "No liquidity for exit");
    return;
  }

  const exitPrice = closeSide === "SELL" ? bestPrice - 0.01 : bestPrice + 0.01;
  const clampedPrice = Math.max(0.01, Math.min(0.99, Math.round(exitPrice * 100) / 100));

  const whaleEntryPrice = Number(copy.whaleEntryPrice);
  const ourEntryPrice = Number(copy.ourEntryPrice ?? whaleEntryPrice);
  const realizedPnl = copy.side === "BUY"
    ? (clampedPrice - ourEntryPrice) * shares
    : (ourEntryPrice - clampedPrice) * shares;

  if (env.DRY_RUN) {
    logger.info(
      { copyId: copy.copyId, exitPrice: clampedPrice, realizedPnl, mode: "PAPER" },
      "Paper exit executed",
    );
  } else {
    await adapter.signAndPlace({
      tokenId: copy.tokenId,
      price: clampedPrice,
      size: shares,
      side: closeSide === "SELL" ? ORDER_SIDE.SELL : ORDER_SIDE.BUY,
      negRisk: false,
      expiration: BigInt(Math.floor(Date.now() / 1000) + 120),
    });
  }

  const now = BigInt(Date.now());
  await db
    .update(copiedPositions)
    .set({ status: "CLOSED", closedAt: now, realizedPnlUsdc: realizedPnl })
    .where(eq(copiedPositions.copyId, copy.copyId));

  await db.insert(exits).values({
    copyId: copy.copyId,
    whaleAddress: copy.whaleAddress,
    whaleExitTxHash: whaleExitTxHash ?? null,
    exitType,
    exitPrice: clampedPrice,
    sizeShares: shares,
    realizedPnlUsdc: realizedPnl,
    timestamp: now,
  });

  const redis = getRedis();
  await redis.publish(
    REDIS_CHANNELS.FILLS,
    JSON.stringify({
      type: "EXIT",
      copyId: copy.copyId,
      exitType,
      exitPrice: clampedPrice,
      realizedPnl,
      timestamp: Date.now(),
    }),
  );
}
