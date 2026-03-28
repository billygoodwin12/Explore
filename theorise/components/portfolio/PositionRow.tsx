import React from 'react';
import type { Position } from '@/lib/venues/types';
import DirectionBadge from '@/components/trade/DirectionBadge';

interface PositionRowProps {
  position: Position;
}

export default function PositionRow({ position }: PositionRowProps) {
  const isPnlPositive = position.unrealizedPnl >= 0;
  const pnlColor = isPnlPositive
    ? 'var(--accent-green, #34d399)'
    : 'var(--accent-red, #f87171)';

  return (
    <div
      className="flex items-center justify-between py-3 px-3 rounded-lg transition-colors"
      style={{
        backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.02))',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
      }}
    >
      {/* Left: symbol + direction */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-sm font-bold"
            style={{ color: 'var(--text-primary, rgba(255,255,255,0.92))' }}
          >
            {position.symbol}
          </span>
          <DirectionBadge direction={position.direction} />
          <span
            className="font-mono text-xs"
            style={{ color: 'var(--text-tertiary, rgba(255,255,255,0.30))' }}
          >
            {position.leverage}x
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-xs"
            style={{ color: 'var(--text-tertiary, rgba(255,255,255,0.30))' }}
          >
            Entry: ${position.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
          <span
            className="font-mono text-xs"
            style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}
          >
            Now: ${position.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Right: size + P&L */}
      <div className="flex flex-col items-end gap-1">
        <span
          className="font-mono text-sm"
          style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}
        >
          ${position.size.toLocaleString()} USDC
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold" style={{ color: pnlColor }}>
            {isPnlPositive ? '+' : ''}
            ${position.unrealizedPnl.toFixed(2)}
          </span>
          <span className="font-mono text-xs" style={{ color: pnlColor }}>
            ({isPnlPositive ? '+' : ''}
            {position.unrealizedPnlPercent.toFixed(2)}%)
          </span>
        </div>
      </div>
    </div>
  );
}
