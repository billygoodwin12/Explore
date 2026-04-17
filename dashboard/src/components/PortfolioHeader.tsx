import React from "react";
import type { BotSnapshot } from "../types";

interface Props {
  snapshot: BotSnapshot | null;
  connected: boolean;
  onPause: () => void;
  onResume: () => void;
  onKill: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    LIVE: "bg-green-500",
    PAPER: "bg-blue-500",
    HALTED: "bg-red-600",
    COOLDOWN: "bg-amber-500",
  };
  return (
    <span
      className={`px-3 py-1 rounded-full text-white text-sm font-bold ${colors[status] ?? "bg-gray-500"}`}
    >
      {status}
    </span>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

export function PortfolioHeader({
  snapshot,
  connected,
  onPause,
  onResume,
  onKill,
}: Props) {
  const [showKillConfirm, setShowKillConfirm] = React.useState(false);

  if (!snapshot) {
    return (
      <div className="bg-gray-900 p-6 rounded-lg border border-gray-800">
        <p className="text-gray-400">Waiting for bot connection...</p>
      </div>
    );
  }

  const pnlColor =
    snapshot.daily_pnl_usdc >= 0 ? "text-green-400" : "text-red-400";
  const ddWidth = Math.min(Math.abs(snapshot.drawdown_pct) * 20, 100);
  const ddColor = Math.abs(snapshot.drawdown_pct) > 0.03 ? "bg-red-500" : "bg-amber-500";

  return (
    <div className="bg-gray-900 p-6 rounded-lg border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <StatusBadge status={snapshot.status} />
          <span
            className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-500"}`}
          />
          <span className="text-gray-400 text-sm">
            Uptime: {formatUptime(snapshot.uptime_s)}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onPause}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm"
          >
            Pause
          </button>
          <button
            onClick={onResume}
            className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-sm"
          >
            Resume
          </button>
          {showKillConfirm ? (
            <div className="flex gap-1">
              <button
                onClick={() => {
                  onKill();
                  setShowKillConfirm(false);
                }}
                className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded text-sm font-bold"
              >
                Confirm Kill
              </button>
              <button
                onClick={() => setShowKillConfirm(false)}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowKillConfirm(true)}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-sm"
            >
              Kill
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <div>
          <p className="text-gray-400 text-xs uppercase">Total Equity</p>
          <p className="text-white text-2xl font-bold">
            ${snapshot.equity_usdc.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs uppercase">Daily P&L</p>
          <p className={`text-2xl font-bold ${pnlColor}`}>
            ${snapshot.daily_pnl_usdc >= 0 ? "+" : ""}
            {snapshot.daily_pnl_usdc.toFixed(2)} (
            {(snapshot.daily_pnl_pct * 100).toFixed(2)}%)
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs uppercase">Cumulative P&L</p>
          <p
            className={`text-2xl font-bold ${snapshot.cumulative_pnl_usdc >= 0 ? "text-green-400" : "text-red-400"}`}
          >
            ${snapshot.cumulative_pnl_usdc >= 0 ? "+" : ""}
            {snapshot.cumulative_pnl_usdc.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs uppercase">Daily Drawdown</p>
          <div className="mt-1">
            <div className="w-full bg-gray-700 rounded-full h-4 relative">
              <div
                className={`${ddColor} h-4 rounded-full transition-all`}
                style={{ width: `${ddWidth}%` }}
              />
              <div
                className="absolute top-0 h-4 border-r-2 border-red-600"
                style={{ left: "100%" }}
                title="-5% kill switch"
              />
            </div>
            <p className="text-gray-400 text-xs mt-1">
              {(snapshot.drawdown_pct * 100).toFixed(2)}% (kill @ -5%)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
