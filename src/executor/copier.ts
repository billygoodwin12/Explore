import type { ClobAdapter } from "../clob/adapter.js";
import type { TradeSignal } from "../tracker/signal.js";
import { ORDER_SIDE } from "../clob/orders.js";
import { getDb } from "../persist/db.js";
import { copiedPositions } from "../persist/schema.js";
import { getRedis, REDIS_CHANNELS } from "../persist/redis.js";
import { getEnv } from "../config/index.js";
import { logger } from "../logger.js";

export interface CopyResult {
  ok: boolean;
  copyId?: string;
  clobOrderId?: string;
  ourPrice?: number;
  reason?: string;
}

const ORDER_TTL_SEC = 120;

export async function placeCopyOrder(
  signal: TradeSignal,
  sizeUsdc: number,
  adapter: ClobAdapter,
): Promise<CopyResult> {
  const env = getEnv();

  const book = await adapter.getOrderBook(signal.tokenId);

  let targetPrice: number;
  if (signal.side === "BUY") {
    const bestAsk = book.asks[0]?.price;
    if (!bestAsk) return { ok: false, reason: "NO_ASKS" };
    targetPrice = Math.min(signal.price, bestAsk + 0.01);
  } else {
    const bestBid = book.bids[0]?.price;
    if (!bestBid) return { ok: false, reason: "NO_BIDS" };
    targetPrice = Math.max(signal.price, bestBid - 0.01);
  }

  targetPrice = Math.max(0.01, Math.min(0.99, Math.round(targetPrice * 100) / 100));
  const shares = sizeUsdc / targetPrice;

  const db = getDb();
  const now = BigInt(Date.now());

  const [inserted] = await db
    .insert(copiedPositions)
    .values({
      whaleAddress: signal.whaleAddress,
      whaleTxHash: signal.transactionHash,
      conditionId: signal.conditionId,
      tokenId: signal.tokenId,
      side: signal.side,
      whaleEntryPrice: signal.price,
      ourEntryPrice: targetPrice,
      sizeUsdc,
      sizeShares: shares,
      status: "PENDING",
      openedAt: now,
      takeProfitPrice: signal.side === "BUY"
        ? targetPrice * (1 + env.TAKE_PROFIT_PCT / 100)
        : targetPrice * (1 - env.TAKE_PROFIT_PCT / 100),
    })
    .returning();

  if (!inserted) return { ok: false, reason: "DB_INSERT_FAILED" };

  if (env.DRY_RUN) {
    logger.info(
      {
        mode: "PAPER",
        copyId: inserted.copyId,
        whale: signal.whaleAddress,
        market: signal.marketSlug,
        side: signal.side,
        size: sizeUsdc.toFixed(2),
        price: targetPrice,
      },
      "Paper copy order",
    );

    await db
      .update(copiedPositions)
      .set({ status: "OPEN", filledAt: BigInt(Date.now()) })
      .where(eqCopy(inserted.copyId));

    await publishFill(inserted.copyId, signal, sizeUsdc, targetPrice);
    return { ok: true, copyId: inserted.copyId, ourPrice: targetPrice };
  }

  try {
    const expiration = BigInt(Math.floor(Date.now() / 1000) + ORDER_TTL_SEC);
    const result = await adapter.signAndPlace({
      tokenId: signal.tokenId,
      price: targetPrice,
      size: shares,
      side: signal.side === "BUY" ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
      negRisk: signal.negRisk,
      expiration,
    });

    await db
      .update(copiedPositions)
      .set({ ourOrderId: result.clobOrderId, status: "OPEN", filledAt: BigInt(Date.now()) })
      .where(eqCopy(inserted.copyId));

    await publishFill(inserted.copyId, signal, sizeUsdc, targetPrice);

    logger.info(
      {
        copyId: inserted.copyId,
        orderId: result.clobOrderId,
        whale: signal.whaleAddress,
        market: signal.marketSlug,
        side: signal.side,
        size: sizeUsdc.toFixed(2),
        price: targetPrice,
      },
      "Copy order placed",
    );

    return { ok: true, copyId: inserted.copyId, clobOrderId: result.clobOrderId, ourPrice: targetPrice };
  } catch (err) {
    await db
      .update(copiedPositions)
      .set({ status: "FAILED", closedAt: BigInt(Date.now()) })
      .where(eqCopy(inserted.copyId));
    logger.error({ err, copyId: inserted.copyId }, "Copy order placement failed");
    return { ok: false, copyId: inserted.copyId, reason: (err as Error).message };
  }
}

async function publishFill(
  copyId: string,
  signal: TradeSignal,
  sizeUsdc: number,
  price: number,
): Promise<void> {
  const redis = getRedis();
  await redis.publish(
    REDIS_CHANNELS.FILLS,
    JSON.stringify({
      copyId,
      whaleAddress: signal.whaleAddress,
      whaleUsername: signal.whaleUsername,
      market: signal.marketTitle,
      slug: signal.marketSlug,
      side: signal.side,
      size: sizeUsdc,
      price,
      whalePrice: signal.price,
      timestamp: Date.now(),
    }),
  );
}

import { eq } from "drizzle-orm";
function eqCopy(copyId: string) {
  return eq(copiedPositions.copyId, copyId);
}
