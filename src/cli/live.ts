import { loadEnv, getEnv } from "../config/index.js";
import { verifyGeoblock, verifyContractAddresses } from "../config/verify-addresses.js";
import { PolymarketClobAdapter } from "../clob/polymarket-adapter.js";
import { ClobWebSocket } from "../clob/ws.js";
import { cancelAllOrders } from "../clob/orders.js";
import { onChainCancelOrders } from "../chain/cancel-fallback.js";
import { MarketCache } from "../gamma/cache.js";
import { selectUniverse, type SelectedMarket } from "../strategy/selector.js";
import { executeQuoteCycle, type ActiveQuote, type MarketQuoteTarget } from "../strategy/quoter.js";
import { setMidnightEquity, checkDrawdown, updateCurrentEquity, resetMidnightEquity } from "../risk/drawdown.js";
import { ClobHeartbeat } from "../risk/heartbeat.js";
import { reconcilePositions } from "../risk/reconcile.js";
import { AskNewsPoller } from "../news/asknews.js";
import { processNewsItem, isCooling, type MarketMapping } from "../news/withdraw.js";
import { setAppState, getAppState, getRedis } from "../persist/redis.js";
import { StateBroadcaster } from "../server/state-broadcaster.js";
import { startServer } from "../server/index.js";
import { closeDb } from "../persist/db.js";
import { closeRedis } from "../persist/redis.js";
import { logger } from "../logger.js";

async function main() {
  loadEnv();
  const env = getEnv();
  const dryRun = env.DRY_RUN;

  logger.info({ dryRun }, "Starting Polymarket AMM bot...");

  await verifyGeoblock();
  await verifyContractAddresses();

  await setAppState({
    halted: false,
    reason: null,
    mode: dryRun ? "PAPER" : "LIVE",
    pausedAt: null,
  });

  const adapter = new PolymarketClobAdapter();
  const marketCache = new MarketCache();
  const heartbeat = new ClobHeartbeat();
  const ws = new ClobWebSocket();
  const newsPoller = new AskNewsPoller();
  const broadcaster = new StateBroadcaster();

  await marketCache.refresh();

  const server = await startServer(broadcaster);
  await broadcaster.start();

  let universe: SelectedMarket[] = [];
  const activeQuotes = new Map<string, { bid: ActiveQuote | null; ask: ActiveQuote | null }>();

  async function refreshUniverse() {
    universe = await selectUniverse(adapter);
    const allTokenIds = universe.flatMap((m) => m.tokenIds);
    ws.subscribeMarkets(allTokenIds);

    activeQuotes.clear();
    for (const m of universe) {
      activeQuotes.set(m.conditionId, { bid: null, ask: null });
    }
  }

  await refreshUniverse();

  setMidnightEquity(env.MAX_CAPITAL_USDC);

  heartbeat.setFallbackHandler(async () => {
    logger.error("Executing on-chain fallback cancel...");
    const openOrders = await adapter.getOpenOrders();
    if (openOrders.length > 0) {
      logger.warn({ count: openOrders.length }, "Would cancel orders on-chain (fallback)");
    }
  });
  heartbeat.start();

  const marketMappings = new Map<string, MarketMapping>();
  function updateMappings() {
    marketMappings.clear();
    for (const m of universe) {
      marketMappings.set(m.slug, {
        slug: m.slug,
        conditionId: m.conditionId,
        tokenIds: m.tokenIds,
      });
    }
  }
  updateMappings();

  newsPoller.setHandler(async (items) => {
    const activeSlugs = universe.map((m) => m.slug);
    for (const item of items) {
      await processNewsItem(item, activeSlugs, marketMappings);
    }
  });
  newsPoller.start();

  const quoteInterval = setInterval(async () => {
    const appState = await getAppState();
    if (appState.halted || appState.mode === "HALTED") return;

    for (const market of universe) {
      if (isCooling(market.slug)) continue;

      const target: MarketQuoteTarget = {
        conditionId: market.conditionId,
        tokenId: market.tokenIds[0]!,
        negRisk: market.negRisk,
        maxIncentiveSpreadBps: market.maxIncentiveSpreadBps,
        minIncentiveSize: market.minIncentiveSize,
        dailyRate: market.dailyRate,
        plannedSpread: 0.02,
      };

      const current = activeQuotes.get(market.conditionId) ?? {
        bid: null,
        ask: null,
      };

      try {
        const result = await executeQuoteCycle(
          target,
          adapter,
          current.bid,
          current.ask,
        );
        activeQuotes.set(market.conditionId, {
          bid: result.newBid,
          ask: result.newAsk,
        });
      } catch (err) {
        logger.error({ err, slug: market.slug }, "Quote cycle error");
      }
    }

    await checkDrawdown();
  }, 5000);

  const reconcileInterval = setInterval(async () => {
    const allTokenIds = universe.flatMap((m) => m.tokenIds);
    if (allTokenIds.length > 0) {
      await reconcilePositions(allTokenIds);
    }
  }, 60_000);

  const universeRefreshInterval = setInterval(async () => {
    await marketCache.refresh();
    await refreshUniverse();
    updateMappings();
  }, 24 * 60 * 60 * 1000);

  const midnightResetInterval = setInterval(() => {
    const now = new Date();
    if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0) {
      resetMidnightEquity();
    }
  }, 60_000);

  async function shutdown(signal: string) {
    logger.info({ signal }, "Graceful shutdown initiated");
    clearInterval(quoteInterval);
    clearInterval(reconcileInterval);
    clearInterval(universeRefreshInterval);
    clearInterval(midnightResetInterval);

    heartbeat.stop();
    newsPoller.stop();
    ws.close();
    broadcaster.stop();

    try {
      await cancelAllOrders();
      logger.info("All orders cancelled");
    } catch (err) {
      logger.error({ err }, "Failed to cancel orders during shutdown");
    }

    await server.close();
    await closeDb();
    await closeRedis();

    logger.info("Shutdown complete");
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  logger.info(
    {
      mode: dryRun ? "PAPER" : "LIVE",
      markets: universe.length,
      port: env.DASHBOARD_PORT,
    },
    "Bot is running",
  );
}

main().catch((err) => {
  logger.error({ err }, "Fatal error");
  process.exit(1);
});
