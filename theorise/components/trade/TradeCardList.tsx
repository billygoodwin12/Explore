'use client';

import React, { useState, useCallback } from 'react';
import type { EnrichedRecommendation } from '@/lib/venues/types';
import TradeCard from './TradeCard';

interface TradeCardListProps {
  recommendations: EnrichedRecommendation[];
}

export default function TradeCardList({ recommendations }: TradeCardListProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((asset: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(asset)) {
        next.delete(asset);
      } else {
        next.add(asset);
      }
      return next;
    });
  }, []);

  const totalSelected = selected.size;
  const totalSize = totalSelected * 100;

  return (
    <div>
      {recommendations.map((rec, index) => (
        <TradeCard
          key={`${rec.venue}-${rec.symbol}-${index}`}
          recommendation={rec}
          marketData={rec.marketData}
          index={index}
          selected={selected.has(rec.symbol)}
          onToggle={() => toggle(rec.symbol)}
        />
      ))}

      {/* Batch invest bar */}
      {totalSelected > 0 && (
        <div style={{ marginTop: 4, marginBottom: 12 }}>
          <button
            style={{
              width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
              background: '#1a1917', fontSize: 14, fontWeight: 700, color: 'white',
              cursor: 'pointer', letterSpacing: '-0.01em', transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#2d2c28'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = '#1a1917'; }}
          >
            Invest in {totalSelected} position{totalSelected > 1 ? 's' : ''} · ${totalSize}
          </button>
        </div>
      )}
    </div>
  );
}
