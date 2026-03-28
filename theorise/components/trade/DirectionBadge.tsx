import React from 'react';
import type { Direction } from '@/lib/venues/types';

interface DirectionBadgeProps {
  direction: Direction;
  instrumentType?: string;
}

export default function DirectionBadge({ direction, instrumentType }: DirectionBadgeProps) {
  const isPrediction = instrumentType === 'prediction';
  let label: string;
  if (isPrediction) {
    label = direction === 'BUY_YES' ? 'Yes' : 'No';
  } else {
    label = direction === 'LONG' ? 'Long' : 'Short';
  }
  const bull = direction === 'LONG' || direction === 'BUY_YES';

  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      padding: '2px 8px', borderRadius: 4,
      background: bull ? '#dcfce7' : '#fee2e2',
      color: bull ? '#15803d' : '#dc2626',
    }}>
      {label}
    </span>
  );
}
