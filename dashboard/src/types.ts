export type DashboardMessage =
  | { type: "snapshot"; payload: BotSnapshot }
  | { type: "fill"; payload: FillEvent }
  | { type: "signal"; payload: SignalEvent }
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
  followed_wallets: WalletState[];
  positions: CopiedPosition[];
  system: SystemStatus;
}

export interface WalletState {
  address: string;
  username: string | null;
  rank: number;
  composite_score: number;
  their_pnl_30d: number;
  our_active_copies: number;
  our_pnl_from_wallet: number;
  last_trade_ts: number;
  status: "TRACKING" | "PAUSED" | "DORMANT";
}

export interface CopiedPosition {
  copy_id: string;
  market_slug: string;
  market_name: string;
  side: "BUY" | "SELL";
  copied_from: string;
  copied_from_name: string | null;
  our_entry_price: number;
  whale_entry_price: number;
  current_price: number;
  size_usdc: number;
  unrealized_pnl_usdc: number;
  unrealized_pnl_pct: number;
  trailing_stop_price: number | null;
  hold_time_s: number;
}

export interface FillEvent {
  copyId?: string;
  side?: string;
  size?: number;
  price?: number;
  market?: string;
  type?: string;
  exitType?: string;
  exitPrice?: number;
  realizedPnl?: number;
  timestamp: number;
}

export interface SignalEvent {
  type: string;
  whaleAddress?: string;
  whaleUsername?: string | null;
  marketSlug?: string;
  marketTitle?: string;
  side?: "BUY" | "SELL";
  whalePrice?: number;
  whaleSizeUsdc?: number;
  disposition?: "COPIED" | "SKIPPED" | "MISSED";
  reason?: string;
  ourFillPrice?: number;
  ourSizeUsdc?: number;
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
  rpc_block_lag?: number;
  poll_stats?: { total: number; fast: number; slow: number };
  rate_limit_pct?: number;
  postgres_connected?: boolean;
  redis_connected?: boolean;
}

export interface EventLogEntry {
  id: string;
  timestamp: number;
  severity: "info" | "warning" | "error" | "success";
  message: string;
}
