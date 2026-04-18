'use client';

import { C, D, M } from '@/styles/tokens';
import { useVaultCreateStore, type Timeframe } from '@/stores/vault-create-store';

const TIMEFRAMES: Timeframe[] = ['1h', '4h', '1d', '3d', '7d', '2w', '1m', '3m'];

export default function Step2Timeframe() {
  const { timeframe, desc, setTimeframe, setDesc } = useVaultCreateStore();

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, fontFamily: D, marginBottom: 6 }}>
          Timeframe
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
          {TIMEFRAMES.map(t => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              style={{
                padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                fontSize: 11, fontWeight: 700, fontFamily: M, textAlign: 'center',
                border: `1px solid ${timeframe === t ? C.primary : C.borderLight}`,
                background: timeframe === t ? C.primary : C.bg,
                color: timeframe === t ? '#fff' : C.secondary,
                transition: 'all 0.1s',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: D, marginTop: 6, lineHeight: 1.5 }}>
          All positions auto-close at the end of the timeframe. Depositors and you are paid out at final NAV.
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, fontFamily: D, marginBottom: 6 }}>
          Theory (optional)
        </div>
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Why these positions, why now? Depositors can read this."
          style={{
            width: '100%', padding: '8px 11px', borderRadius: 8,
            border: `1px solid ${C.borderLight}`, fontSize: 13, fontFamily: D,
            color: C.primary, background: C.bg, outline: 'none',
            resize: 'vertical', minHeight: 60, lineHeight: 1.5, boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );
}
