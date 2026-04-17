import { loadEnv } from "../config/index.js";
import { MarketCache } from "../gamma/cache.js";
import { redeemPosition } from "../chain/redemption.js";
import { logger } from "../logger.js";

async function main() {
  loadEnv();
  logger.info("Scanning for redeemable positions...");

  const cache = new MarketCache();
  await cache.refresh();

  const resolved = cache.getAll().filter((m) => m.closed);
  logger.info({ count: resolved.length }, "Found resolved markets");

  for (const market of resolved) {
    const tokenIds = market.tokens.map((t) => BigInt(t.token_id));
    if (tokenIds.length === 0) continue;

    try {
      const hash = await redeemPosition(
        market.conditionId as `0x${string}`,
        market.negRisk,
        tokenIds,
      );
      if (hash) {
        logger.info(
          { slug: market.slug, hash },
          "Redeemed position",
        );
      }
    } catch (err) {
      logger.error({ err, slug: market.slug }, "Redemption failed");
    }
  }

  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Redeem script failed");
  process.exit(1);
});
