import { logger } from "../logger.js";

export interface OrderFilledEvent {
  timestamp: number;
  maker: string;
  taker: string;
  tokenId: string;
  makerAmount: bigint;
  takerAmount: bigint;
  side: number;
  fee: bigint;
}

export interface TradeReplayConfig {
  tokenId: string;
  from: number;
  to: number;
  plannedSpread: number;
  quoteSize: number;
  ourAddress: string;
}

export interface TradeReplayResult {
  totalTrades: number;
  simulatedFills: number;
  spreadPnl: number;
  feesCollected: number;
  feesPaid: number;
  inventoryPnl: number;
  netPnl: number;
  maxInventory: number;
}

export async function fetchGoldskyFills(
  tokenId: string,
  from: number,
  to: number,
): Promise<OrderFilledEvent[]> {
  const query = `
    query OrderFills($tokenId: String!, $from: Int!, $to: Int!) {
      orderFilledEvents(
        where: {
          tokenId: $tokenId,
          timestamp_gte: $from,
          timestamp_lte: $to
        },
        orderBy: timestamp,
        orderDirection: asc,
        first: 10000
      ) {
        timestamp
        maker
        taker
        tokenId
        makerAmount
        takerAmount
        side
        fee
      }
    }
  `;

  const res = await fetch(
    "https://api.goldsky.com/api/public/project_cl_polymarket/subgraphs/orderbook/prod/gn",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { tokenId, from: Math.floor(from / 1000), to: Math.floor(to / 1000) },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Goldsky query failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    data: { orderFilledEvents: Array<Record<string, string>> };
  };

  return data.data.orderFilledEvents.map((e) => ({
    timestamp: parseInt(e.timestamp!) * 1000,
    maker: e.maker!,
    taker: e.taker!,
    tokenId: e.tokenId!,
    makerAmount: BigInt(e.makerAmount!),
    takerAmount: BigInt(e.takerAmount!),
    side: parseInt(e.side!),
    fee: BigInt(e.fee!),
  }));
}

export async function runTradeReplay(
  config: TradeReplayConfig,
): Promise<TradeReplayResult> {
  const fills = await fetchGoldskyFills(config.tokenId, config.from, config.to);
  logger.info(
    { count: fills.length, tokenId: config.tokenId },
    "Loaded Goldsky fills",
  );

  let inventory = 0;
  let spreadPnl = 0;
  let feesCollected = 0;
  let feesPaid = 0;
  let maxInventory = 0;
  let simulatedFills = 0;
  let avgPrice = 0;

  for (const fill of fills) {
    const fillPrice =
      Number(fill.makerAmount) / Number(fill.takerAmount) || 0;

    const ourBid = fillPrice - config.plannedSpread / 2;
    const ourAsk = fillPrice + config.plannedSpread / 2;

    if (fillPrice <= ourBid && Math.abs(inventory) < config.quoteSize * 2) {
      inventory += config.quoteSize;
      avgPrice =
        (avgPrice * (inventory - config.quoteSize) +
          ourBid * config.quoteSize) /
        inventory;
      spreadPnl += (fillPrice - ourBid) * config.quoteSize;
      simulatedFills++;
    }

    if (fillPrice >= ourAsk && inventory > 0) {
      const sellSize = Math.min(config.quoteSize, inventory);
      spreadPnl += (ourAsk - avgPrice) * sellSize;
      inventory -= sellSize;
      simulatedFills++;
    }

    const fee = Number(fill.fee) / 1_000_000;
    feesPaid += fee * 0.01;
    maxInventory = Math.max(maxInventory, Math.abs(inventory));
  }

  const inventoryPnl = 0;
  const netPnl = spreadPnl - feesPaid + feesCollected + inventoryPnl;

  const result: TradeReplayResult = {
    totalTrades: fills.length,
    simulatedFills,
    spreadPnl,
    feesCollected,
    feesPaid,
    inventoryPnl,
    netPnl,
    maxInventory,
  };

  if (netPnl / (config.quoteSize * 2) > 0.2 / 365) {
    logger.warn(
      result,
      "Backtest shows >20% annualized — likely data bug, investigate",
    );
  }

  logger.info(result, "Trade replay complete");
  return result;
}
