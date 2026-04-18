import { loadEnv } from "../config/index.js";
import { refreshUniverse } from "../tracker/universe.js";
import { closeDb } from "../persist/db.js";
import { closeRedis } from "../persist/redis.js";
import { logger } from "../logger.js";

async function main() {
  loadEnv();
  logger.info("Refreshing followed wallet universe...");
  const scored = await refreshUniverse();
  logger.info({ count: scored.length }, "Universe refresh complete");
  for (const s of scored.slice(0, 10)) {
    logger.info(
      { rank: s.leaderboardRank, addr: s.address, score: s.compositeScore.toFixed(3), pnl: s.leaderboardPnl, winRate: s.winRate },
      "Top wallet",
    );
  }
  await closeDb();
  await closeRedis();
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Universe refresh failed");
  process.exit(1);
});
