import { loadEnv, getEnv } from "../config/index.js";
import { verifyGeoblock, verifyContractAddresses } from "../config/verify-addresses.js";
import { PolymarketClobAdapter } from "../clob/polymarket-adapter.js";
import { cancelAllOrders } from "../clob/orders.js";
import { refreshUniverse, loadTrackedWallets, ActivityPoller, markSeen } from "../tracker/index.js";
import type { TradeSignal } from "../tracker/signal.js";
import { runFilterChain, computeCopySize, setCooldown } from "../evaluator/index.js";
import { placeCopyOrder, handleWhaleExit, checkTakeProfitAndStopLoss, computePortfolioState, persistPnlSnapshot, sellAllPositions } from "../executor/index.js";
import { fetchWalletBalance } from "../data/positions.js";
import { setMidnightEquity, checkDrawdown, updateCurrentEquity, resetMidnightEquity } from "../risk/drawdown.js";
import { ClobHeartbeat } from "../risk/heartbeat.js";
import { setAppState, getAppState, getRedis, REDIS_CHANNELS } from "../persist/redis.js";
import { getDb } from "../persist/db.js";
import { signals as signalsTable, followedWallets } from "../persist/schema.js";
import { eq } from "drizzle-orm";
import { StateBroadcaster } from "../server/state-broadcaster.js";
import { startServer } from "../server/index.js";
import { closeDb } from "../persist/db.js";
import { closeRedis } from "../persist/redis.js";
import { logger } from "../logger.js";

async function main() {
  loadEnv();
  const env = getEnv();
  const dryRun = env.DRY_RUN;

  logger.info({ dryRun, mode: dryRun ? "PAPER" : "LIVE" }, "Starting Polymarket copy-trading bot...");

  await verifyGeoblock();
  await verifyContractAddresses();

  await setAppState({
    halted: false,
    reason: null,
    mode: dryRun ? "PAPER" : "LIVE",
    pausedAt: null,
  });

  const adapter = new PolymarketClobAdapter();
  const heartbeat = new ClobHeartbeat();
  const poller = new ActivityPoller();
  const broadcaster = new StateBroadcaster();

  const server = await startServer(broadcaster);
  await broadcaster.start();

  // Load or refresh followed wallets
  let tracked = await loadTrackedWallets();
  if (tracked.length === 0) {
    logger.info("No tracked wallets in DB — running universe refresh...");
    const scored = await refreshUniverse();
    tracked = scored.map((s) => ({ ...s }));
  } else {
    logger.info({ count: tracked.length }, "Loaded tracked wallets from DB");
  }

  poller.setWallets(tracked.map((w) => ({ address: w.address, username: w.username })));

  // Determine our starting balance
  let ourBalanceUsdc = env.MAX_CAPITAL_USDC;
  try {
    const liveBalance = await fetchWalletBalance(env.POLYMARKET_FUNDER);
    if (liveBalance > 0) ourBalanceUsdc = liveBalance;
  } catch {}

  setMidnightEquity(ourBalanceUsdc);
  updateCurrentEquity(ourBalanceUsdc);

  heartbeat.start();

  poller.onNewSignal(async (signal: TradeSignal) => {
    await handleSignal(signal);
  });

  async function handleSignal(signal: TradeSignal): Promise<void> {
    const appState = await getAppState();
    if (appState.halted) {
      await logSignal(signal, "SKIPPED", "BOT_HALTED");
      return;
    }

    try {
      // If this is a SELL signal, check for exit mirroring first
      if (signal.side === "SELL") {
        await handleWhaleExit(signal, adapter);
      }

      const portfolio = await computePortfolioState(adapter, ourBalanceUsdc);
      const db = getDb();
      const whaleRow = await db
        .select()
        .from(followedWallets)
        .where(eq(followedWallets.address, signal.whaleAddress));
      const whaleConfig = whaleRow[0];

      const categoryFilter = whaleConfig?.categoryFilter
        ? (whaleConfig.categoryFilter.split(",").map((c) => c.trim()).filter(Boolean))
        : null;
      const sizingMultiplier = whaleConfig?.sizingMultiplier ?? env.SIZING_MULTIPLIER;

      const decision = await runFilterChain({
        signal,
        adapter,
        ourBalanceUsdc: portfolio.totalEquityUsdc,
        totalDeployedUsdc: portfolio.totalDeployedUsdc,
        categoryFilter,
      });

      if (!decision.pass) {
        logger.info(
          { whale: signal.whaleAddress, market: signal.marketSlug, reason: decision.reason },
          "Signal filtered out",
        );
        await logSignal(signal, "SKIPPED", decision.reason);
        await publishSignalEvent(signal, "SKIPPED", decision.reason);
        return;
      }

      if (signal.side !== "BUY") {
        await logSignal(signal, "SKIPPED", "EXIT_HANDLED");
        return;
      }

      const whaleBalance = whaleConfig?.cachedBalanceUsdc ?? signal.usdcSize * 50;
      const sizing = computeCopySize({
        whaleTradeUsdc: signal.usdcSize,
        whaleBalanceUsdc: whaleBalance > 0 ? whaleBalance : signal.usdcSize * 50,
        ourBalanceUsdc: portfolio.totalEquityUsdc,
        sizingMultiplier,
      });

      if (sizing.skipped) {
        await logSignal(signal, "SKIPPED", sizing.reason ?? "SIZE");
        await publishSignalEvent(signal, "SKIPPED", sizing.reason);
        return;
      }

      const result = await placeCopyOrder(signal, sizing.sizeUsdc, adapter);
      if (result.ok) {
        await setCooldown(signal.whaleAddress, signal.conditionId);
        await logSignal(signal, "COPIED", null);
        await publishSignalEvent(signal, "COPIED", null, result.ourPrice, sizing.sizeUsdc);
      } else {
        await logSignal(signal, "FAILED", result.reason ?? "UNKNOWN");
        await publishSignalEvent(signal, "MISSED", result.reason);
      }
    } catch (err) {
      logger.error({ err, tx: signal.transactionHash }, "Signal handler error");
      await logSignal(signal, "ERROR", (err as Error).message);
    }
  }

  async function logSignal(
    signal: TradeSignal,
    disposition: string,
    skipReason: string | null,
  ): Promise<void> {
    const db = getDb();
    try {
      await db
        .insert(signalsTable)
        .values({
          transactionHash: signal.transactionHash,
          whaleAddress: signal.whaleAddress,
          timestamp: BigInt(signal.timestamp),
          side: signal.side,
          conditionId: signal.conditionId,
          tokenId: signal.tokenId,
          outcome: signal.outcome,
          price: signal.price,
          size: signal.size,
          usdcSize: signal.usdcSize,
          marketSlug: signal.marketSlug,
          marketTitle: signal.marketTitle,
          negRisk: signal.negRisk,
          source: signal.source,
          disposition,
          skipReason,
          detectedAt: BigInt(signal.detectedAt),
        })
        .onConflictDoNothing();
    } catch (err) {
      logger.warn({ err }, "Failed to persist signal");
    }
  }

  async function publishSignalEvent(
    signal: TradeSignal,
    disposition: "COPIED" | "SKIPPED" | "MISSED",
    reason: string | null | undefined,
    ourFillPrice?: number,
    ourSizeUsdc?: number,
  ): Promise<void> {
    const redis = getRedis();
    await redis.publish(
      REDIS_CHANNELS.NEWS,
      JSON.stringify({
        type: "signal",
        whaleAddress: signal.whaleAddress,
        whaleUsername: signal.whaleUsername,
        marketSlug: signal.marketSlug,
        marketTitle: signal.marketTitle,
        side: signal.side,
        whalePrice: signal.price,
        whaleSizeUsdc: signal.usdcSize,
        disposition,
        reason,
        ourFillPrice,
        ourSizeUsdc,
        timestamp: Date.now(),
      }),
    );
  }

  poller.start();

  const tpSlInterval = setInterval(async () => {
    const appState = await getAppState();
    if (appState.halted) return;
    try {
      await checkTakeProfitAndStopLoss(adapter);
    } catch (err) {
      logger.error({ err }, "TP/SL check error");
    }
  }, 30_000);

  const portfolioInterval = setInterval(async () => {
    try {
      const state = await computePortfolioState(adapter, ourBalanceUsdc);
      updateCurrentEquity(state.totalEquityUsdc);
      await persistPnlSnapshot(state);
      await checkDrawdown();
    } catch (err) {
      logger.error({ err }, "Portfolio update error");
    }
  }, 60_000);

  const universeRefreshInterval = setInterval(async () => {
    try {
      const scored = await refreshUniverse();
      poller.setWallets(scored.map((s) => ({ address: s.address, username: s.username })));
    } catch (err) {
      logger.error({ err }, "Universe refresh error");
    }
  }, 24 * 60 * 60 * 1000);

  const midnightResetInterval = setInterval(() => {
    const now = new Date();
    if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0) {
      resetMidnightEquity();
    }
  }, 60_000);

  async function shutdown(signal: string) {
    logger.info({ signal }, "Graceful shutdown initiated");
    clearInterval(tpSlInterval);
    clearInterval(portfolioInterval);
    clearInterval(universeRefreshInterval);
    clearInterval(midnightResetInterval);

    heartbeat.stop();
    poller.stop();
    broadcaster.stop();

    if (!dryRun) {
      try {
        await cancelAllOrders();
        logger.info("All orders cancelled");
      } catch (err) {
        logger.error({ err }, "Cancel on shutdown failed");
      }
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
      wallets: tracked.length,
      port: env.DASHBOARD_PORT,
      balance: ourBalanceUsdc,
    },
    "Copy-trading bot is running",
  );
}

main().catch((err) => {
  logger.error({ err }, "Fatal error");
  process.exit(1);
});
