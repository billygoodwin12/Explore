"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

import { cn } from "@/lib/utils";

type SparklineProps = {
  data: number[];
  sentiment?: "auto" | "positive" | "negative" | "neutral";
  width?: number | string;
  height?: number;
  className?: string;
};

const colorByName = {
  positive: "rgb(0,122,255)",
  negative: "rgb(244,33,46)",
  neutral: "rgb(140,140,140)",
};

export function Sparkline({
  data,
  sentiment = "auto",
  width = "100%",
  height = 28,
  className,
}: SparklineProps) {
  if (data.length === 0) {
    return (
      <div
        className={cn("h-7 w-full bg-surface-2 rounded-sm", className)}
        style={{ height }}
      />
    );
  }

  const resolved =
    sentiment === "auto"
      ? data[data.length - 1]! >= data[0]!
        ? "positive"
        : "negative"
      : sentiment;

  const stroke = colorByName[resolved];
  const id = `spark-${resolved}-${data.length}`;

  const points = data.map((v, i) => ({ i, v }));

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width={width} height={height}>
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.5}
            fill={`url(#${id})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
