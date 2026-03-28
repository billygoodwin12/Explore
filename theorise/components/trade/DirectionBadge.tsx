import React from 'react';
import type { Direction } from '@/lib/venues/types';

interface DirectionBadgeProps {
  direction: Direction;
}

const directionConfig: Record<Direction, { label: string; color: string; bg: string }> = {
  LONG: {
    label: 'LONG',
    color: 'var(--accent-green, #34d399)',
    bg: 'rgba(52, 211, 153, 0.12)',
  },
  SHORT: {
    label: 'SHORT',
    color: 'var(--accent-red, #f87171)',
    bg: 'rgba(248, 113, 113, 0.12)',
  },
  BUY_YES: {
    label: 'BUY YES',
    color: 'var(--accent-green, #34d399)',
    bg: 'rgba(52, 211, 153, 0.12)',
  },
  BUY_NO: {
    label: 'BUY NO',
    color: 'var(--accent-red, #f87171)',
    bg: 'rgba(248, 113, 113, 0.12)',
  },
};

export default function DirectionBadge({ direction }: DirectionBadgeProps) {
  const config = directionConfig[direction];

  return (
    <span
      className="font-extrabold tracking-wide rounded inline-block"
      style={{
        fontSize: '11px',
        padding: '3px 10px',
        backgroundColor: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}
