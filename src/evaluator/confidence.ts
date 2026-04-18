import { getDb } from "../persist/db.js";
import { signals } from "../persist/schema.js";
import { and, eq, gte } from "drizzle-orm";
import { getEnv } from "../config/index.js";

export async function passesConfluenceGate(
  conditionId: string,
  side: "BUY" | "SELL",
  lookbackHours: number = 6,
): Promise<{ pass: boolean; count: number }> {
  const env = getEnv();
  if (env.CONFLUENCE_MIN_WALLETS <= 1) return { pass: true, count: 0 };

  const db = getDb();
  const cutoff = BigInt(Math.floor((Date.now() - lookbackHours * 3600 * 1000) / 1000));

  const rows = await db
    .select({ whale: signals.whaleAddress })
    .from(signals)
    .where(
      and(
        eq(signals.conditionId, conditionId),
        eq(signals.side, side),
        gte(signals.timestamp, cutoff),
      ),
    );

  const uniqueWhales = new Set(rows.map((r) => r.whale));
  return {
    pass: uniqueWhales.size >= env.CONFLUENCE_MIN_WALLETS,
    count: uniqueWhales.size,
  };
}
