import React from 'react';
import type { Venue } from '@/lib/venues/types';

interface VenueTagProps {
  venue: Venue;
}

export default function VenueTag({ venue }: VenueTagProps) {
  const isHL = venue === 'hyperliquid';
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
      padding: '2px 8px', borderRadius: 4,
      background: isHL ? '#ecfdf5' : '#f3f0ff',
      color: isHL ? '#059669' : '#7c3aed',
    }}>
      {isHL ? 'Futures' : 'Prediction'}
    </span>
  );
}
