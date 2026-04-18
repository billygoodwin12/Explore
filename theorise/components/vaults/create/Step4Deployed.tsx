'use client';

import { C, D, M } from '@/styles/tokens';
import { useVaultCreateStore, calcTotalIM } from '@/stores/vault-create-store';

const fmt = (n: number) => {
  const r = Math.round(n * 100) / 100;
  if (r >= 1000) return '$' + r.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return '$' + r.toFixed(2).replace(/\.00$/, '');
};

export default function Step4Deployed() {
  const s = useVaultCreateStore();
  const addr = s.vaultAddress ?? '0x7a3f...c92e';

  const tweetText = [
    `\uD83D\uDCE6 ${s.name}`,
    s.positions.map(p => `${p.sym} ${p.dir === 'long' ? 'Long' : 'Short'} ${p.lev}x (${p.alloc}%)`).join(' / '),
    `${s.timeframe} \u00B7 ${s.perfFee}% perf fee`,
    `theorise.xyz/vaults/${addr}`,
  ].join('\n');

  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%', background: C.greenBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 14px', fontSize: 22, color: C.green,
      }}>
        {'\u2713'}
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: C.primary, fontFamily: D, marginBottom: 4 }}>
        {s.name} is live
      </div>
      <div style={{ fontSize: 12, color: C.muted, fontFamily: D, marginBottom: 12 }}>
        {s.positions.length} positions · {s.timeframe} · {s.perfFee}% perf fee · {fmt(s.deploySize)} deployed
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4, marginBottom: 14 }}>
        {s.positions.map(p => (
          <span key={p.sym} style={{
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, fontFamily: M,
            background: p.dir === 'long' ? C.greenBg : C.redBg,
            color: p.dir === 'long' ? C.greenTxt : C.redTxt,
          }}>
            {p.sym} {p.dir === 'long' ? 'L' : 'S'} {p.lev}x {p.alloc}%
          </span>
        ))}
      </div>

      <div style={{
        background: C.bg, borderRadius: 8, padding: '9px 13px', fontSize: 11,
        fontFamily: M, color: C.accent, margin: '10px 0', wordBreak: 'break-all',
        border: `1px solid ${C.borderLight}`, textAlign: 'left',
      }}>
        theorise.xyz/vaults/{addr}
      </div>

      <button
        onClick={() => {
          window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank');
        }}
        style={{
          width: '100%', padding: '11px 0', borderRadius: 10, border: 'none',
          cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: D,
          background: C.primary, color: '#fff', marginBottom: 8,
        }}
      >
        Share on X
      </button>
      <button
        onClick={() => { window.location.href = `/vaults/${addr}`; }}
        style={{
          width: '100%', padding: '11px 0', borderRadius: 10,
          border: `1px solid ${C.borderLight}`, cursor: 'pointer',
          fontSize: 13, fontWeight: 700, fontFamily: D,
          background: C.bg, color: C.secondary,
        }}
      >
        View vault
      </button>

      <div style={{ height: 1, background: C.borderLight, margin: '14px 0' }} />
      <div style={{ fontSize: 11, color: C.muted, fontFamily: D, marginBottom: 8, textAlign: 'left' }}>
        Active on this vault
      </div>
      <div style={{ textAlign: 'left' }}>
        {['Live P&L leaderboard', 'Depositor count', 'Expiry countdown', 'Rich X share card', 'Creator track record'].map(f => (
          <span key={f} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: C.bg, border: `1px solid ${C.borderLight}`,
            borderRadius: 20, padding: '4px 10px', fontSize: 10, color: C.secondary,
            fontFamily: D, margin: '0 4px 5px 0',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, display: 'inline-block', flexShrink: 0 }} />
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}
