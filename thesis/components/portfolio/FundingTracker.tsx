import React from 'react';

interface FundingEntry {
  symbol: string;
  accumulatedFunding: number;
}

interface FundingTrackerProps {
  entries?: FundingEntry[];
}

const mockEntries: FundingEntry[] = [
  { symbol: 'ETH-PERP', accumulatedFunding: 12.45 },
  { symbol: 'BTC-PERP', accumulatedFunding: -3.82 },
  { symbol: 'SOL-PERP', accumulatedFunding: 5.17 },
];

export default function FundingTracker({ entries = mockEntries }: FundingTrackerProps) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.02))',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
      }}
    >
      <span
        className="text-xs font-medium mb-3 block"
        style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}
      >
        Accumulated Funding
      </span>
      <div className="space-y-2">
        {entries.map((entry) => {
          const isPositive = entry.accumulatedFunding >= 0;
          const color = isPositive
            ? 'var(--accent-green, #34d399)'
            : 'var(--accent-red, #f87171)';

          return (
            <div
              key={entry.symbol}
              className="flex items-center justify-between"
            >
              <span
                className="font-mono text-xs"
                style={{
                  color: 'var(--text-primary, rgba(255,255,255,0.92))',
                }}
              >
                {entry.symbol}
              </span>
              <span
                className="font-mono text-xs font-bold"
                style={{ color }}
              >
                {isPositive ? '+' : ''}
                ${entry.accumulatedFunding.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
