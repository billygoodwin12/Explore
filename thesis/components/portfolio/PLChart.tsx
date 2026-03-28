'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

const mockData = [
  { time: '00:00', pnl: 0 },
  { time: '04:00', pnl: 12.5 },
  { time: '08:00', pnl: -5.3 },
  { time: '12:00', pnl: 28.7 },
  { time: '16:00', pnl: 45.2 },
  { time: '20:00', pnl: 38.1 },
  { time: '24:00', pnl: 52.4 },
];

export default function PLChart() {
  const lastValue = mockData[mockData.length - 1]?.pnl ?? 0;
  const isPositive = lastValue >= 0;
  const color = isPositive ? '#34d399' : '#f87171';
  const fillColor = isPositive
    ? 'rgba(52, 211, 153, 0.12)'
    : 'rgba(248, 113, 113, 0.12)';

  return (
    <div
      className="rounded-lg p-3"
      style={{
        backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.02))',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
      }}
    >
      <span
        className="text-xs font-medium mb-2 block"
        style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}
      >
        P&amp;L (24h)
      </span>
      <div style={{ width: '100%', height: 120 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={mockData}>
            <defs>
              <linearGradient id="plGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.30)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                backgroundColor: '#14141f',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'rgba(255,255,255,0.92)',
              }}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, 'P&L']}
            />
            <Area
              type="monotone"
              dataKey="pnl"
              stroke={color}
              strokeWidth={2}
              fill="url(#plGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
