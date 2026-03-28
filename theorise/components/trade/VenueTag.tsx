import React from 'react';
import type { Venue } from '@/lib/venues/types';

interface VenueTagProps {
  venue: Venue;
}

const venueConfig: Record<Venue, { label: string; bg: string; color: string }> = {
  hyperliquid: {
    label: 'Futures',
    bg: 'rgba(34, 197, 94, 0.08)',
    color: '#16a34a',
  },
  polymarket: {
    label: 'Prediction',
    bg: 'rgba(107, 92, 231, 0.08)',
    color: '#6B5CE7',
  },
};

export default function VenueTag({ venue }: VenueTagProps) {
  const config = venueConfig[venue];

  return (
    <span
      className="text-xs font-semibold rounded-full inline-block"
      style={{
        backgroundColor: config.bg,
        color: config.color,
        padding: '3px 10px',
      }}
    >
      {config.label}
    </span>
  );
}
