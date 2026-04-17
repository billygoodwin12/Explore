import { loadEnv } from "../config/index.js";
import { fetchMarketBySlug } from "../gamma/client.js";
import { runPriceReplay } from "../backtest/price-replay.js";
import { runTradeReplay } from "../backtest/trade-replay.js";
import { getEnv } from "../config/env.js";
import { logger } from "../logger.js";

function parseArgs(): {
  market: string;
  from: number;
  to: number;
  mode: "price" | "trade";
} {
  const args = process.argv.slice(2);
  let market = "";
  let from = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let to = Date.now();
  let mode: "price" | "trade" = "price";

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--market":
        market = args[++i]!;
        break;
      case "--from":
        from = parseInt(args[++i]!, 10);
        break;
      case "--to":
        to = parseInt(args[++i]!, 10);
        break;
      case "--mode":
        mode = args[++i] as "price" | "trade";
        break;
    }
  }

  if (!market) {
    logger.error("Usage: pnpm run backtest -- --market <slug> [--from <ts>] [--to <ts>] [--mode price|trade]");
    process.exit(1);
  }

  return { market, from, to, mode };
}

async function main() {
  loadEnv();
  const { market: slug, from, to, mode } = parseArgs();

  logger.info({ slug, from, to, mode }, "Starting backtest...");

  const market = await fetchMarketBySlug(slug);
  if (!market) {
    logger.error({ slug }, "Market not found");
    process.exit(1);
  }

  const tokenId = market.tokens[0]?.token_id;
  if (!tokenId) {
    logger.error({ slug }, "No token ID found");
    process.exit(1);
  }

  if (mode === "price") {
    const result = await runPriceReplay({
      tokenId,
      from,
      to,
      plannedSpread: 0.02,
      quoteSize: 100,
    });
    logger.info({ slug, ...result }, "Price replay results");
  } else {
    const env = getEnv();
    const result = await runTradeReplay({
      tokenId,
      from,
      to,
      plannedSpread: 0.02,
      quoteSize: 100,
      ourAddress: env.POLYMARKET_FUNDER,
    });
    logger.info({ slug, ...result }, "Trade replay results");
  }

  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Backtest failed");
  process.exit(1);
});
