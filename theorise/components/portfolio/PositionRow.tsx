import React from 'react';
import type { Position } from '@/lib/venues/types';
import DirectionBadge from '@/components/trade/DirectionBadge';

interface PositionRowProps {
  position: Position;
}

export default function PositionRow({ position }: PositionRowProps) {
  const isPnlPositive = position.unrealizedPnl >= 0;
  const pnlColor = isPnlPositive ? '#16a34a' : '#dc2626';

  return (
    <div
      className="flex items-center justify-between py-3 px-3 rounded-lg"
      style={{
        backgroundColor: '#FAFAF8',
        border: '1px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>
            {position.name}
          </span>
          <DirectionBadge direction={position.direction} />
        </div>
        <span className="font-mono text-xs" style={{ color: '#999999' }}>
          ${position.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} → ${position.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      </div>

      <div className="flex flex-col items-end gap-1">
        <span className="font-mono text-sm font-semibold" style={{ color: pnlColor }}>
          {isPnlPositive ? '+' : ''}${position.unrealizedPnl.toFixed(2)}
        </span>
        <span className="font-mono text-xs" style={{ color: pnlColor }}>
          ({isPnlPositive ? '+' : ''}{position.unrealizedPnlPercent.toFixed(2)}%)
        </span>
      </div>
    </div>
  );
}
