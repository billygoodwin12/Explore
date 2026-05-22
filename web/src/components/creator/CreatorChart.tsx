"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MockCreator } from "@/lib/mock/types";

type ChartPoint = { i: number; nav: number; hoursAgo: number };

function buildPoints(history: number[]): ChartPoint[] {
  return history.map((nav, i) => ({
    i,
    nav,
    hoursAgo: history.length - 1 - i,
  }));
}

function formatCompactUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export function CreatorChart({ creator }: { creator: MockCreator }) {
  const points = buildPoints(creator.navHistory);
  const positive = creator.pnl30dBps >= 0;
  const stroke = positive ? "rgb(72,207,174)" : "rgb(244,88,88)";
  const fillId = `chart-${positive ? "p" : "n"}-${creator.id.slice(2, 8)}`;

  const min = Math.min(...creator.navHistory);
  const max = Math.max(...creator.navHistory);
  const pad = (max - min) * 0.08 || max * 0.005;

  return (
    <section className="rounded-lg border border-line bg-surface p-4 sm:p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-label">NAV · last 24 ticks</div>
          <div className="num text-heading-lg text-ink">
            ${Math.round(creator.nav).toLocaleString()}
          </div>
        </div>
        <div className="text-right">
          <div className="text-label">30d</div>
          <div
            className={
              "num text-heading-md " +
              (positive ? "text-positive" : "text-negative")
            }
          >
            {positive ? "+" : ""}
            {(creator.pnl30dBps / 100).toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={points}
            margin={{ top: 8, right: 4, bottom: 4, left: 4 }}
          >
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="rgb(230,230,226)"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="i"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "rgb(110,110,110)", fontSize: 11 }}
              tickFormatter={(i) =>
                i === 0
                  ? "−24h"
                  : i === Math.floor(points.length / 2)
                    ? "−12h"
                    : i === points.length - 1
                      ? "now"
                      : ""
              }
              interval={0}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={56}
              domain={[min - pad, max + pad]}
              tick={{ fill: "rgb(110,110,110)", fontSize: 11 }}
              tickFormatter={(v: number) => formatCompactUsd(v)}
            />
            <Tooltip
              cursor={{ stroke: "rgb(110,110,110)", strokeDasharray: "3 3" }}
              contentStyle={{
                background: "rgb(255,255,255)",
                border: "1px solid rgb(230,230,226)",
                borderRadius: 6,
                fontSize: 12,
                fontFamily: "var(--font-inter)",
                padding: "6px 10px",
              }}
              labelFormatter={(label: number) =>
                `${points.length - 1 - label}h ago`
              }
              formatter={(val: number) => [
                `$${Math.round(val).toLocaleString()}`,
                "NAV",
              ]}
            />
            <Area
              type="monotone"
              dataKey="nav"
              stroke={stroke}
              strokeWidth={1.75}
              fill={`url(#${fillId})`}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
