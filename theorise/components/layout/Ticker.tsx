'use client';

import { C, D, M, fmt } from '@/styles/tokens';

const PERPS = [
  { sym: 'BTC', price: 87241.50, chg: 2.41 },
  { sym: 'ETH', price: 1842.30,  chg: -0.89 },
  { sym: 'SOL', price: 142.85,   chg: 4.12 },
  { sym: 'CL',  price: 71.42,    chg: 3.14 },
  { sym: 'GC',  price: 2441.80,  chg: 0.67 },
  { sym: 'NQ',  price: 21345.40, chg: -1.23 },
];

export default function Ticker() {
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
      {PERPS.map(p => (
        <div key={p.sym} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: M, color: C.secondary }}>{p.sym}</span>
          <span style={{ fontSize: 10, fontFamily: M, color: C.primary, fontWeight: 600 }}>{fmt(p.price)}</span>
          <span style={{ fontSize: 9, fontFamily: M, fontWeight: 700, color: p.chg >= 0 ? C.green : C.red }}>
            {p.chg >= 0 ? '+' : ''}{p.chg}%
          </span>
        </div>
      ))}
    </div>
  );
}
