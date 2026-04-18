'use client';

import { C, D, M } from '@/styles/tokens';
import { useVaultCreateStore, type Timeframe, type SettlementMode } from '@/stores/vault-create-store';

const TIMEFRAMES: Timeframe[] = ['1h', '4h', '1d', '3d', '7d', '2w', '1m', '3m'];

const SETTLEMENT_MODES: { id: SettlementMode; title: string; desc: string }[] = [
  {
    id: 'HARD',
    title: 'Hard expiry',
    desc: 'Auto-closes all positions at end time. Fully automatic \u2014 no human input needed. Most scam-resistant.',
  },
  {
    id: 'SOFT',
    title: 'Soft expiry + exit window',
    desc: 'Notifies depositors at expiry. 48hr withdrawal window at current NAV before force-settlement triggers.',
  },
  {
    id: 'CREATOR',
    title: 'Creator close',
    desc: 'You can trigger early settlement with 24hr depositor notice. Hard deadline still applies at original end time.',
  },
];

export default function Step2Timeframe() {
  const { timeframe, settlementMode, desc, setTimeframe, setSettlementMode, setDesc } = useVaultCreateStore();

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
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, fontFamily: D, marginBottom: 6 }}>
          Settlement mode
        </div>
        {SETTLEMENT_MODES.map(m => {
          const active = settlementMode === m.id;
          return (
            <div
              key={m.id}
              onClick={() => setSettlementMode(m.id)}
              style={{
                padding: '11px 13px', borderRadius: 10, cursor: 'pointer', marginBottom: 7,
                border: `1px solid ${active ? C.accent : C.borderLight}`,
                background: active ? '#F0F5FA' : C.bg,
                transition: 'all 0.1s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1.5px solid ${active ? C.accent : C.border}`,
                  background: active ? C.accent : 'transparent',
                }}>
                  {active && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.primary, fontFamily: D }}>
                  {m.title}
                </span>
              </div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: D, marginTop: 4, lineHeight: 1.5, paddingLeft: 22 }}>
                {m.desc}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, fontFamily: D, marginBottom: 6 }}>
          Thesis (optional)
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
