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

export const markets = pgTable(
  "markets",
  {
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
  },
  (t) => [
    index("idx_markets_slug").on(t.slug),
    index("idx_markets_active").on(t.active),
  ],
);

export const quoteCycles = pgTable(
  "quote_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conditionId: text("condition_id")
      .notNull()
      .references(() => markets.conditionId),
    timestamp: bigint("timestamp", { mode: "bigint" }).notNull(),
    bidPrice: real("bid_price"),
    askPrice: real("ask_price"),
    bidSize: real("bid_size"),
    askSize: real("ask_size"),
    mid: real("mid").notNull(),
    spreadBps: real("spread_bps").notNull(),
    inventorySkew: real("inventory_skew"),
    reasonCode: text("reason_code").notNull(),
    action: text("action").notNull(),
  },
  (t) => [
    index("idx_quote_cycles_condition").on(t.conditionId),
    index("idx_quote_cycles_ts").on(t.timestamp),
  ],
);

export const orders = pgTable(
  "orders",
  {
    clientId: uuid("client_id").primaryKey(),
    clobId: text("clob_id"),
    conditionId: text("condition_id")
      .notNull()
      .references(() => markets.conditionId),
    tokenId: text("token_id").notNull(),
    side: integer("side").notNull(),
    price: real("price").notNull(),
    size: real("size").notNull(),
    status: text("status").notNull().default("pending"),
    signedPayload: jsonb("signed_payload").notNull(),
    createdAt: bigint("created_at", { mode: "bigint" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "bigint" }).notNull(),
  },
  (t) => [
    index("idx_orders_clob_id").on(t.clobId),
    index("idx_orders_condition").on(t.conditionId),
    index("idx_orders_status").on(t.status),
  ],
);

export const fills = pgTable(
  "fills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.clientId),
    conditionId: text("condition_id").notNull(),
    tokenId: text("token_id").notNull(),
    side: integer("side").notNull(),
    price: real("price").notNull(),
    size: real("size").notNull(),
    fee: real("fee").notNull(),
    timestamp: bigint("timestamp", { mode: "bigint" }).notNull(),
  },
  (t) => [
    index("idx_fills_condition").on(t.conditionId),
    index("idx_fills_ts").on(t.timestamp),
  ],
);

export const positionsSnapshot = pgTable(
  "positions_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timestamp: bigint("timestamp", { mode: "bigint" }).notNull(),
    conditionId: text("condition_id").notNull(),
    tokenId: text("token_id").notNull(),
    onChainBalance: bigint("on_chain_balance", { mode: "bigint" }).notNull(),
    apiBalance: real("api_balance").notNull(),
    drift: real("drift").notNull(),
  },
  (t) => [index("idx_positions_snapshot_ts").on(t.timestamp)],
);

export const rewardsPayouts = pgTable(
  "rewards_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    epoch: text("epoch").notNull(),
    conditionId: text("condition_id"),
    amountUsdc: real("amount_usdc").notNull(),
    receivedAt: bigint("received_at", { mode: "bigint" }).notNull(),
  },
  (t) => [index("idx_rewards_epoch").on(t.epoch)],
);

export const llmCalls = pgTable(
  "llm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    model: text("model").notNull(),
    promptHash: text("prompt_hash").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    output: jsonb("output").notNull(),
    cost: real("cost"),
    latencyMs: integer("latency_ms"),
    timestamp: bigint("timestamp", { mode: "bigint" }).notNull(),
  },
  (t) => [index("idx_llm_calls_ts").on(t.timestamp)],
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
  (t) => [
    index("idx_risk_events_type").on(t.type),
    index("idx_risk_events_ts").on(t.timestamp),
  ],
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
