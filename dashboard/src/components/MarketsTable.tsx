import React from "react";
import type { MarketState } from "../types";

interface Props {
  markets: MarketState[];
}

function StatusCell({ status }: { status: MarketState["status"] }) {
  const styles: Record<string, string> = {
    QUOTING: "text-green-400",
    COOLING: "text-amber-400 bg-amber-900/30",
    WITHDRAWN: "text-red-400 bg-red-900/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? ""}`}>
      {status}
    </span>
  );
}

export function MarketsTable({ markets }: Props) {
  if (markets.length === 0) {
    return (
      <div className="bg-gray-900 p-6 rounded-lg border border-gray-800">
        <h2 className="text-white text-lg font-semibold mb-2">Active Markets</h2>
        <p className="text-gray-400">No active markets in universe</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 p-6 rounded-lg border border-gray-800 overflow-x-auto">
      <h2 className="text-white text-lg font-semibold mb-4">Active Markets</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs uppercase border-b border-gray-800">
            <th className="text-left pb-2">Market</th>
            <th className="text-right pb-2">Bid</th>
            <th className="text-right pb-2">Ask</th>
            <th className="text-right pb-2">Mid</th>
            <th className="text-right pb-2">Spread</th>
            <th className="text-right pb-2">Inventory</th>
            <th className="text-right pb-2">Net Delta</th>
            <th className="text-right pb-2">Reward</th>
            <th className="text-right pb-2">Est Daily</th>
            <th className="text-right pb-2">24h P&L</th>
            <th className="text-center pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m) => (
            <tr
              key={m.slug}
              className={`border-b border-gray-800/50 ${
                m.status === "COOLING"
                  ? "bg-amber-900/10"
                  : m.status === "WITHDRAWN"
                    ? "bg-red-900/10"
                    : ""
              }`}
            >
              <td className="py-2 text-white max-w-48 truncate" title={m.name}>
                {m.name}
              </td>
              <td className="py-2 text-right text-green-400">
                {m.our_bid != null ? m.our_bid.toFixed(2) : "-"}
              </td>
              <td className="py-2 text-right text-red-400">
                {m.our_ask != null ? m.our_ask.toFixed(2) : "-"}
              </td>
              <td className="py-2 text-right text-white">{m.mid.toFixed(3)}</td>
              <td className="py-2 text-right text-gray-300">
                {m.spread_bps.toFixed(0)}
                <span className="text-gray-500">/{m.max_incentive_spread_bps.toFixed(0)}</span>
              </td>
              <td className="py-2 text-right text-gray-300">
                <span className="text-green-400">{m.inventory_yes.toFixed(0)}Y</span>
                {" / "}
                <span className="text-red-400">{m.inventory_no.toFixed(0)}N</span>
              </td>
              <td className="py-2 text-right text-white">
                ${m.net_delta_usdc.toFixed(2)}
              </td>
              <td className="py-2 text-right text-purple-400">
                {m.reward_score.toFixed(2)}
              </td>
              <td className="py-2 text-right text-green-300">
                ${m.est_daily_reward_usdc.toFixed(2)}
              </td>
              <td
                className={`py-2 text-right ${m.spread_pnl_24h_usdc >= 0 ? "text-green-400" : "text-red-400"}`}
              >
                ${m.spread_pnl_24h_usdc >= 0 ? "+" : ""}
                {m.spread_pnl_24h_usdc.toFixed(2)}
              </td>
              <td className="py-2 text-center">
                <StatusCell status={m.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
