'use client';

import { C, M, fmt } from '@/styles/tokens';
import { useMarketData } from '@/hooks/useMarketData';

export default function Ticker() {
  const { markets, loading } = useMarketData(5000);

  // Show top 6 assets in the ticker strip
  const display = markets.slice(0, 6);

  return (
    <div style={{
      display: 'flex',
      gap: 20,
      padding: '6px 20px',
      borderBottom: `1px solid ${C.border}`,
      background: C.card,
      overflowX: 'auto',
      flexShrink: 0,
    }}>
      {loading && display.length === 0 ? (
        <span style={{ fontSize: 10, fontFamily: M, color: C.muted }}>Loading markets...</span>
      ) : (
        display.map(p => (
          <div key={p.sym} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: M, color: C.secondary }}>{p.sym}</span>
            <span style={{ fontSize: 10, fontFamily: M, color: C.primary, fontWeight: 600 }}>{fmt(p.price)}</span>
            <span style={{ fontSize: 9, fontFamily: M, fontWeight: 700, color: p.chg >= 0 ? C.green : C.red }}>
              {p.chg >= 0 ? '+' : ''}{p.chg}%
            </span>
          </div>
        ))
      )}
    </div>
  );
}
