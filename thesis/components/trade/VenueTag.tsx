import React from 'react';
import type { Venue } from '@/lib/venues/types';

interface VenueTagProps {
  venue: Venue;
}

const venueStyles: Record<
  Venue,
  { bg: string; color: string }
> = {
  hyperliquid: {
    bg: 'rgba(110, 231, 183, 0.10)',
    color: 'var(--venue-hyperliquid, #6ee7b7)',
  },
  polymarket: {
    bg: 'rgba(147, 130, 255, 0.10)',
    color: 'var(--venue-polymarket, #9382ff)',
  },
};

export default function VenueTag({ venue }: VenueTagProps) {
  const styles = venueStyles[venue];

  return (
    <span
      className="text-xs font-bold tracking-widest uppercase rounded-sm inline-block"
      style={{
        backgroundColor: styles.bg,
        color: styles.color,
        padding: '2px 8px',
      }}
    >
      {venue}
    </span>
  );
}
