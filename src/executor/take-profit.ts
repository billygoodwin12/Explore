import type { ClobAdapter } from "../clob/adapter.js";
import { getDb } from "../persist/db.js";
import { copiedPositions } from "../persist/schema.js";
import { eq } from "drizzle-orm";
import { sellPosition } from "./exit-mirror.js";
import { getEnv } from "../config/index.js";
import { logger } from "../logger.js";

export async function checkTakeProfitAndStopLoss(
  adapter: ClobAdapter,
): Promise<void> {
  const env = getEnv();
  const db = getDb();

  const openCopies = await db
    .select()
    .from(copiedPositions)
    .where(eq(copiedPositions.status, "OPEN"));

  for (const copy of openCopies) {
    try {
      const book = await adapter.getOrderBook(copy.tokenId);
      const bestBid = book.bids[0]?.price ?? 0;
      const bestAsk = book.asks[0]?.price ?? 1;
      const markPrice = (bestBid + bestAsk) / 2;

      const shares = Number(copy.sizeShares ?? 0);
      const ourEntry = Number(copy.ourEntryPrice ?? copy.whaleEntryPrice);
      const unrealized = copy.side === "BUY"
        ? (markPrice - ourEntry) * shares
        : (ourEntry - markPrice) * shares;

      const peakPnl = Math.max(Number(copy.peakPnlUsdc ?? 0), unrealized);
      if (peakPnl > Number(copy.peakPnlUsdc ?? 0)) {
        await db
          .update(copiedPositions)
          .set({ peakPnlUsdc: peakPnl })
          .where(eq(copiedPositions.copyId, copy.copyId));
      }

      const sizeUsdc = Number(copy.sizeUsdc);
      const unrealizedPct = unrealized / sizeUsdc;

      if (unrealizedPct >= env.TAKE_PROFIT_PCT / 100) {
        logger.info(
          { copyId: copy.copyId, pnl: unrealized, pct: unrealizedPct },
          "TAKE_PROFIT triggered",
        );
        await sellPosition(copy, adapter, "TAKE_PROFIT");
        continue;
      }

      if (peakPnl > 0) {
        const pullback = (peakPnl - unrealized) / sizeUsdc;
        if (pullback >= env.STOP_LOSS_PCT / 100) {
          logger.info(
            { copyId: copy.copyId, peakPnl, current: unrealized, pullback },
            "TRAILING_STOP triggered",
          );
          await sellPosition(copy, adapter, "TRAILING_STOP");
          continue;
        }
      } else if (unrealizedPct <= -env.STOP_LOSS_PCT / 100) {
        logger.info(
          { copyId: copy.copyId, pnl: unrealized, pct: unrealizedPct },
          "STOP_LOSS triggered",
        );
        await sellPosition(copy, adapter, "STOP_LOSS");
      }
    } catch (err) {
      logger.warn({ err, copyId: copy.copyId }, "TP/SL check error");
    }
  }
}
