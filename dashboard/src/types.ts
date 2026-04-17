export type DashboardMessage =
  | { type: "snapshot"; payload: BotSnapshot }
  | { type: "fill"; payload: FillEvent }
  | { type: "news"; payload: NewsAlert }
  | { type: "risk"; payload: RiskEvent }
  | { type: "system"; payload: SystemStatus };

export type DashboardCommand =
  | { type: "command"; action: "pause" | "resume" | "kill" };

export interface BotSnapshot {
  status: "LIVE" | "PAPER" | "HALTED" | "COOLDOWN";
  equity_usdc: number;
  daily_pnl_usdc: number;
  daily_pnl_pct: number;
  cumulative_pnl_usdc: number;
  drawdown_pct: number;
  uptime_s: number;
  last_heartbeat_ts: number;
  markets: MarketState[];
  rewards: RewardsState;
  system: SystemStatus;
}

export interface MarketState {
  slug: string;
  name: string;
  our_bid: number | null;
  our_ask: number | null;
  mid: number;
  spread_bps: number;
  max_incentive_spread_bps: number;
  inventory_yes: number;
  inventory_no: number;
  net_delta_usdc: number;
  reward_score: number;
  est_daily_reward_usdc: number;
  spread_pnl_24h_usdc: number;
  status: "QUOTING" | "COOLING" | "WITHDRAWN";
}

export interface RewardsState {
  est_today_usdc: number;
  history_7d: number[];
  cumulative_usdc: number;
  annualized_yield_pct: number;
}

export interface FillEvent {
  side: string;
  size: number;
  price: number;
  market: string;
  timestamp: number;
}

export interface NewsAlert {
  headline: string;
  severity: "low" | "medium" | "high";
  affectedSlugs: string[];
  direction: string;
  rationale: string;
  timestamp: number;
}

export interface RiskEvent {
  type: string;
  drawdown?: number;
  message?: string;
  timestamp: number;
}

export interface SystemStatus {
  clob_latency_p50?: number;
  clob_latency_p99?: number;
  ws_connected?: boolean;
  ws_shard_count?: number;
  rpc_block_lag?: number;
  llm_calls_per_hour?: number;
  llm_avg_latency_ms?: number;
  llm_last_error?: string;
  postgres_connected?: boolean;
  redis_connected?: boolean;
}

export interface EventLogEntry {
  id: string;
  timestamp: number;
  severity: "info" | "warning" | "error" | "success";
  message: string;
}
