import React from 'react';

interface VenueIndicator {
  name: string;
  color: string;
  live: boolean;
}

const venues: VenueIndicator[] = [
  { name: 'HYPERLIQUID', color: 'var(--venue-hyperliquid, #6ee7b7)', live: true },
  { name: 'POLYMARKET', color: 'var(--venue-polymarket, #9382ff)', live: true },
  { name: 'dYdX', color: 'rgba(255,255,255,0.30)', live: false },
  { name: 'GMX', color: 'rgba(255,255,255,0.30)', live: false },
];

export default function VenueStatusBar() {
  return (
    <div
      className="h-8 flex items-center gap-6 px-4 md:px-6 border-b overflow-x-auto"
      style={{
        backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.02))',
        borderColor: 'var(--border-subtle, rgba(255,255,255,0.04))',
      }}
    >
      {venues.map((venue) => (
        <div
          key={venue.name}
          className="flex items-center gap-2 shrink-0"
          style={{ opacity: venue.live ? 1 : 0.4 }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: venue.color,
              boxShadow: venue.live ? `0 0 6px ${venue.color}` : 'none',
            }}
          />
          <span
            className="font-mono text-xs font-medium tracking-wider"
            style={{ color: venue.live ? venue.color : 'var(--text-tertiary, rgba(255,255,255,0.30))' }}
          >
            {venue.name}
          </span>
          {!venue.live && (
            <span
              className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                color: 'var(--text-tertiary, rgba(255,255,255,0.30))',
              }}
            >
              SOON
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
