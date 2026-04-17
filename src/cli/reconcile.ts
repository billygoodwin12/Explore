import { loadEnv } from "../config/index.js";
import { MarketCache } from "../gamma/cache.js";
import { reconcilePositions } from "../risk/reconcile.js";
import { logger } from "../logger.js";

async function main() {
  loadEnv();
  logger.info("Running one-shot reconciliation...");

  const cache = new MarketCache();
  await cache.refresh();

  const allTokenIds = cache
    .getAll()
    .flatMap((m) => m.tokens.map((t) => t.token_id));

  const results = await reconcilePositions(allTokenIds);
  const alerts = results.filter((r) => r.alert);

  if (alerts.length > 0) {
    logger.warn(
      { alerts: alerts.map((a) => ({ tokenId: a.tokenId, drift: a.drift })) },
      "Position drift alerts",
    );
  } else {
    logger.info("No position drift detected");
  }

  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Reconciliation failed");
  process.exit(1);
});
