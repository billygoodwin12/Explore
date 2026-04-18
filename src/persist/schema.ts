import {
  pgTable,
  text,
  integer,
  bigint,
  real,
  boolean,
  timestamp,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";

export const followedWallets = pgTable(
  "followed_wallets",
  {
    address: text("address").primaryKey(),
    username: text("username"),
    leaderboardRank: integer("leaderboard_rank"),
    compositeScore: real("composite_score"),
    leaderboardPnl: real("leaderboard_pnl"),
    winRate: real("win_rate"),
    marketBreadth: integer("market_breadth"),
    tradesLast7d: integer("trades_last_7d"),
    botProbability: real("bot_probability"),
    cachedBalanceUsdc: real("cached_balance_usdc"),
    sizingMultiplier: real("sizing_multiplier").notNull().default(1.0),
    categoryFilter: text("category_filter"),
    status: text("status").notNull().default("TRACKING"),
    addedAt: bigint("added_at", { mode: "bigint" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "bigint" }).notNull(),
  },
  (t) => [
    index("idx_followed_status").on(t.status),
    index("idx_followed_score").on(t.compositeScore),
  ],
);

export const walletScoresHistory = pgTable(
  "wallet_scores_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    address: text("address").notNull(),
    compositeScore: real("composite_score"),
    leaderboardPnl: real("leaderboard_pnl"),
    winRate: real("win_rate"),
    marketBreadth: integer("market_breadth"),
    snapshotAt: bigint("snapshot_at", { mode: "bigint" }).notNull(),
  },
  (t) => [index("idx_scores_addr").on(t.address)],
);

export const signals = pgTable(
  "signals",
  {
    transactionHash: text("transaction_hash").primaryKey(),
    whaleAddress: text("whale_address").notNull(),
    timestamp: bigint("timestamp", { mode: "bigint" }).notNull(),
    side: text("side").notNull(),
    conditionId: text("condition_id").notNull(),
    tokenId: text("token_id").notNull(),
    outcome: text("outcome").notNull(),
    price: real("price").notNull(),
    size: real("size").notNull(),
    usdcSize: real("usdc_size").notNull(),
    marketSlug: text("market_slug").notNull(),
    marketTitle: text("market_title").notNull(),
    negRisk: boolean("neg_risk").notNull().default(false),
    source: text("source").notNull(),
    disposition: text("disposition"),
    skipReason: text("skip_reason"),
    detectedAt: bigint("detected_at", { mode: "bigint" }).notNull(),
  },
  (t) => [
    index("idx_signals_whale").on(t.whaleAddress),
    index("idx_signals_market").on(t.conditionId),
    index("idx_signals_disposition").on(t.disposition),
    index("idx_signals_ts").on(t.timestamp),
  ],
);

export const copiedPositions = pgTable(
  "copied_positions",
  {
    copyId: uuid("copy_id").primaryKey().defaultRandom(),
    whaleAddress: text("whale_address").notNull(),
    whaleTxHash: text("whale_tx_hash").notNull(),
    ourOrderId: text("our_order_id"),
    ourTxHash: text("our_tx_hash"),
    conditionId: text("condition_id").notNull(),
    tokenId: text("token_id").notNull(),
    side: text("side").notNull(),
    whaleEntryPrice: real("whale_entry_price").notNull(),
    ourEntryPrice: real("our_entry_price"),
    sizeUsdc: real("size_usdc").notNull(),
    sizeShares: real("size_shares"),
    status: text("status").notNull().default("PENDING"),
    openedAt: bigint("opened_at", { mode: "bigint" }).notNull(),
    filledAt: bigint("filled_at", { mode: "bigint" }),
    closedAt: bigint("closed_at", { mode: "bigint" }),
    realizedPnlUsdc: real("realized_pnl_usdc"),
    peakPnlUsdc: real("peak_pnl_usdc"),
    trailingStopPrice: real("trailing_stop_price"),
    takeProfitPrice: real("take_profit_price"),
  },
  (t) => [
    index("idx_copies_whale").on(t.whaleAddress),
    index("idx_copies_condition").on(t.conditionId),
    index("idx_copies_status").on(t.status),
    index("idx_copies_tx").on(t.whaleTxHash),
  ],
);

export const fills = pgTable(
  "fills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    copyId: uuid("copy_id"),
    clobOrderId: text("clob_order_id"),
    conditionId: text("condition_id").notNull(),
    tokenId: text("token_id").notNull(),
    side: text("side").notNull(),
    price: real("price").notNull(),
    size: real("size").notNull(),
    fee: real("fee").notNull().default(0),
    timestamp: bigint("timestamp", { mode: "bigint" }).notNull(),
  },
  (t) => [index("idx_fills_copy").on(t.copyId), index("idx_fills_ts").on(t.timestamp)],
);

export const exits = pgTable(
  "exits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    copyId: uuid("copy_id"),
    whaleAddress: text("whale_address").notNull(),
    whaleExitTxHash: text("whale_exit_tx_hash"),
    ourExitTxHash: text("our_exit_tx_hash"),
    exitType: text("exit_type").notNull(),
    exitPrice: real("exit_price"),
    sizeShares: real("size_shares"),
    realizedPnlUsdc: real("realized_pnl_usdc"),
    timestamp: bigint("timestamp", { mode: "bigint" }).notNull(),
  },
  (t) => [index("idx_exits_copy").on(t.copyId), index("idx_exits_ts").on(t.timestamp)],
);

export const pnlSnapshots = pgTable(
  "pnl_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timestamp: bigint("timestamp", { mode: "bigint" }).notNull(),
    totalEquityUsdc: real("total_equity_usdc").notNull(),
    realizedPnlUsdc: real("realized_pnl_usdc").notNull(),
    unrealizedPnlUsdc: real("unrealized_pnl_usdc").notNull(),
    openPositions: integer("open_positions").notNull(),
    totalDeployedUsdc: real("total_deployed_usdc").notNull(),
  },
  (t) => [index("idx_pnl_ts").on(t.timestamp)],
);

export const riskEvents = pgTable(
  "risk_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    message: text("message").notNull(),
    data: jsonb("data"),
    timestamp: bigint("timestamp", { mode: "bigint" }).notNull(),
  },
  (t) => [index("idx_risk_events_type").on(t.type), index("idx_risk_events_ts").on(t.timestamp)],
);

export const onChainTxs = pgTable(
  "on_chain_txs",
  {
    hash: text("hash").primaryKey(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    data: jsonb("data"),
    createdAt: bigint("created_at", { mode: "bigint" }).notNull(),
    confirmedAt: bigint("confirmed_at", { mode: "bigint" }),
  },
  (t) => [index("idx_on_chain_txs_type").on(t.type)],
);

// Keep for backward compat
export const markets = pgTable("markets", {
  conditionId: text("condition_id").primaryKey(),
  slug: text("slug").notNull(),
  question: text("question").notNull(),
  category: text("category").notNull(),
  endDate: timestamp("end_date"),
  negRisk: boolean("neg_risk").notNull().default(false),
  tokensJson: jsonb("tokens_json").notNull(),
  rewardsJson: jsonb("rewards_json"),
  active: boolean("active").notNull().default(true),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const llmCalls = pgTable("llm_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  model: text("model").notNull(),
  promptHash: text("prompt_hash").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  output: jsonb("output").notNull(),
  cost: real("cost"),
  latencyMs: integer("latency_ms"),
  timestamp: bigint("timestamp", { mode: "bigint" }).notNull(),
});
