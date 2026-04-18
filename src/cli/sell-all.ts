import { loadEnv } from "../config/index.js";
import { PolymarketClobAdapter } from "../clob/polymarket-adapter.js";
import { sellAllPositions } from "../executor/position-mgr.js";
import { setAppState } from "../persist/redis.js";
import { closeDb } from "../persist/db.js";
import { closeRedis } from "../persist/redis.js";
import { logger } from "../logger.js";

async function main() {
  loadEnv();
  logger.warn("Emergency: selling all open positions");

  const adapter = new PolymarketClobAdapter();
  const count = await sellAllPositions(adapter, "MANUAL_KILL");

  await setAppState({
    halted: true,
    reason: "Manual sell-all via CLI",
    mode: "HALTED",
    pausedAt: Date.now(),
  });

  logger.warn({ count }, "All positions sold, bot halted");
  await closeDb();
  await closeRedis();
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Sell-all failed");
  process.exit(1);
});
