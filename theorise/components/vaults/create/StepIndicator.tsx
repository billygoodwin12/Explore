'use client';

import { C, M } from '@/styles/tokens';

export default function StepIndicator({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '16px 28px 0' }}>
      {[1, 2, 3, 4].map(n => (
        <div key={n} style={{ display: 'flex', alignItems: 'center', flex: n < 4 ? 1 : 'none' }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, fontFamily: M, flexShrink: 0,
            background: n < current ? C.primary : n === current ? C.accent : C.bg,
            color: n <= current ? '#fff' : C.muted,
            border: n > current ? `1px solid ${C.border}` : 'none',
            transition: 'all 0.2s',
          }}>
            {n}
          </div>
          {n < 4 && (
            <div style={{
              flex: 1, height: 1,
              background: n < current ? C.primary : C.borderLight,
              transition: 'background 0.2s',
            }} />
          )}
        </div>
      ))}
    </div>
  );
}
