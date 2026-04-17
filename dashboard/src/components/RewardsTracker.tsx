import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { RewardsState } from "../types";

interface Props {
  rewards: RewardsState | null;
}

export function RewardsTracker({ rewards }: Props) {
  if (!rewards) {
    return (
      <div className="bg-gray-900 p-6 rounded-lg border border-gray-800">
        <h2 className="text-white text-lg font-semibold mb-2">Rewards</h2>
        <p className="text-gray-400">No rewards data</p>
      </div>
    );
  }

  const chartData = rewards.history_7d.map((val, i) => ({
    day: `D-${rewards.history_7d.length - i}`,
    reward: val,
  }));

  return (
    <div className="bg-gray-900 p-6 rounded-lg border border-gray-800">
      <h2 className="text-white text-lg font-semibold mb-4">Rewards Tracker</h2>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <div>
          <p className="text-gray-400 text-xs uppercase">Est. Today</p>
          <p className="text-purple-400 text-xl font-bold">
            ${rewards.est_today_usdc.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs uppercase">Cumulative</p>
          <p className="text-white text-xl font-bold">
            ${rewards.cumulative_usdc.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs uppercase">Ann. Yield</p>
          <p className="text-green-400 text-xl font-bold">
            {rewards.annualized_yield_pct.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs uppercase">7d Avg</p>
          <p className="text-white text-xl font-bold">
            $
            {rewards.history_7d.length > 0
              ? (
                  rewards.history_7d.reduce((a, b) => a + b, 0) /
                  rewards.history_7d.length
                ).toFixed(2)
              : "0.00"}
          </p>
        </div>
      </div>

      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={chartData}>
            <XAxis
              dataKey="day"
              tick={{ fill: "#6b7280", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "8px",
                color: "#fff",
              }}
            />
            <Area
              type="monotone"
              dataKey="reward"
              stroke="#a855f7"
              fill="#a855f7"
              fillOpacity={0.2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
