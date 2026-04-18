import React from "react";
import type { CopiedPosition } from "../types";

interface Props {
  positions: CopiedPosition[];
}

function formatHoldTime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export function ActivePositions({ positions }: Props) {
  if (positions.length === 0) {
    return (
      <div className="bg-gray-900 p-6 rounded-lg border border-gray-800">
        <h2 className="text-white text-lg font-semibold mb-2">Active Positions</h2>
        <p className="text-gray-400">No open positions</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 p-6 rounded-lg border border-gray-800 overflow-x-auto">
      <h2 className="text-white text-lg font-semibold mb-4">
        Active Positions ({positions.length})
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs uppercase border-b border-gray-800">
            <th className="text-left pb-2">Market</th>
            <th className="text-center pb-2">Side</th>
            <th className="text-left pb-2">From</th>
            <th className="text-right pb-2">Our / Their</th>
            <th className="text-right pb-2">Current</th>
            <th className="text-right pb-2">Size</th>
            <th className="text-right pb-2">Unrealized</th>
            <th className="text-right pb-2">Stop</th>
            <th className="text-right pb-2">Hold</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.copy_id} className="border-b border-gray-800/50">
              <td className="py-2 text-white max-w-56 truncate" title={p.market_name}>
                {p.market_name}
              </td>
              <td className="py-2 text-center">
                <span className={p.side === "BUY" ? "text-green-400" : "text-red-400"}>
                  {p.side}
                </span>
              </td>
              <td className="py-2 text-gray-300 font-mono text-xs">
                {p.copied_from_name ?? shortAddr(p.copied_from)}
              </td>
              <td className="py-2 text-right text-gray-300 text-xs">
                {p.our_entry_price.toFixed(3)} / {p.whale_entry_price.toFixed(3)}
              </td>
              <td className="py-2 text-right text-white">{p.current_price.toFixed(3)}</td>
              <td className="py-2 text-right text-gray-300">${p.size_usdc.toFixed(0)}</td>
              <td
                className={`py-2 text-right ${p.unrealized_pnl_usdc >= 0 ? "text-green-400" : "text-red-400"}`}
              >
                ${p.unrealized_pnl_usdc >= 0 ? "+" : ""}
                {p.unrealized_pnl_usdc.toFixed(2)} (
                {(p.unrealized_pnl_pct * 100).toFixed(1)}%)
              </td>
              <td className="py-2 text-right text-gray-400">
                {p.trailing_stop_price != null ? p.trailing_stop_price.toFixed(3) : "-"}
              </td>
              <td className="py-2 text-right text-gray-400">
                {formatHoldTime(p.hold_time_s)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
