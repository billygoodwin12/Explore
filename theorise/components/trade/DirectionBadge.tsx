import React from 'react';
import type { Direction } from '@/lib/venues/types';

interface DirectionBadgeProps {
  direction: Direction;
}

const directionConfig: Record<Direction, { label: string; color: string; bg: string }> = {
  LONG: {
    label: 'Bullish',
    color: '#16a34a',
    bg: 'rgba(34, 197, 94, 0.08)',
  },
  SHORT: {
    label: 'Bearish',
    color: '#dc2626',
    bg: 'rgba(239, 68, 68, 0.08)',
  },
  BUY_YES: {
    label: 'Yes',
    color: '#16a34a',
    bg: 'rgba(34, 197, 94, 0.08)',
  },
  BUY_NO: {
    label: 'No',
    color: '#dc2626',
    bg: 'rgba(239, 68, 68, 0.08)',
  },
};

export default function DirectionBadge({ direction }: DirectionBadgeProps) {
  const config = directionConfig[direction];

  return (
    <span
      className="font-semibold rounded-full inline-block"
      style={{
        fontSize: '12px',
        padding: '3px 12px',
        backgroundColor: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}
