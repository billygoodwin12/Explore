import React from "react";
import type { WalletState } from "../types";

interface Props {
  wallets: WalletState[];
}

function StatusCell({ status }: { status: WalletState["status"] }) {
  const styles: Record<string, string> = {
    TRACKING: "text-green-400",
    PAUSED: "text-amber-400",
    DORMANT: "text-gray-500",
  };
  return <span className={styles[status] ?? "text-gray-400"}>{status}</span>;
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function timeAgo(ts: number): string {
  if (!ts) return "never";
  const s = Math.floor((Date.now() / 1000) - ts);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function FollowedWallets({ wallets }: Props) {
  if (wallets.length === 0) {
    return (
      <div className="bg-gray-900 p-6 rounded-lg border border-gray-800">
        <h2 className="text-white text-lg font-semibold mb-2">Followed Wallets</h2>
        <p className="text-gray-400">No tracked wallets. Run `pnpm run universe:refresh`.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 p-6 rounded-lg border border-gray-800 overflow-x-auto">
      <h2 className="text-white text-lg font-semibold mb-4">
        Followed Wallets ({wallets.length})
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs uppercase border-b border-gray-800">
            <th className="text-left pb-2">#</th>
            <th className="text-left pb-2">Wallet</th>
            <th className="text-right pb-2">Score</th>
            <th className="text-right pb-2">PnL (30d)</th>
            <th className="text-right pb-2">Our Copies</th>
            <th className="text-right pb-2">Our PnL</th>
            <th className="text-right pb-2">Last Trade</th>
            <th className="text-center pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {wallets.map((w) => (
            <tr key={w.address} className="border-b border-gray-800/50">
              <td className="py-2 text-gray-400">{w.rank}</td>
              <td className="py-2 text-white font-mono text-xs">
                {w.username ?? shortAddr(w.address)}
              </td>
              <td className="py-2 text-right text-purple-400">
                {w.composite_score.toFixed(3)}
              </td>
              <td className={`py-2 text-right ${w.their_pnl_30d >= 0 ? "text-green-400" : "text-red-400"}`}>
                ${w.their_pnl_30d.toFixed(0)}
              </td>
              <td className="py-2 text-right text-white">{w.our_active_copies}</td>
              <td className={`py-2 text-right ${w.our_pnl_from_wallet >= 0 ? "text-green-400" : "text-red-400"}`}>
                ${w.our_pnl_from_wallet.toFixed(2)}
              </td>
              <td className="py-2 text-right text-gray-400">{timeAgo(w.last_trade_ts)}</td>
              <td className="py-2 text-center">
                <StatusCell status={w.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
