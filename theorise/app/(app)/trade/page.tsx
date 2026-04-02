'use client';

import { useState } from 'react';
import { C, D, M, fmt } from '@/styles/tokens';

const PERPS = [
  { sym: 'BTC', name: 'Bitcoin',    price: 87241.50, chg: 2.41,  funding: 0.0045, oi: '2.1B', cat: 'crypto' },
  { sym: 'ETH', name: 'Ethereum',   price: 1842.30,  chg: -0.89, funding: 0.0067, oi: '890M', cat: 'crypto' },
  { sym: 'SOL', name: 'Solana',     price: 142.85,   chg: 4.12,  funding: 0.0082, oi: '340M', cat: 'crypto' },
  { sym: 'CL',  name: 'Crude Oil',  price: 71.42,    chg: 3.14,  funding: 0.0031, oi: '180M', cat: 'commodity' },
  { sym: 'GC',  name: 'Gold',       price: 2441.80,  chg: 0.67,  funding: -0.0015, oi: '420M', cat: 'commodity' },
  { sym: 'NQ',  name: 'Nasdaq 100', price: 21345.40, chg: -1.23, funding: 0.0041, oi: '560M', cat: 'index' },
  { sym: 'NG',  name: 'Nat Gas',    price: 2.84,     chg: 1.92,  funding: 0.0022, oi: '95M',  cat: 'commodity' },
  { sym: 'ES',  name: 'S&P 500',    price: 5892.10,  chg: -0.45, funding: 0.0033, oi: '310M', cat: 'index' },
] as const;

type Perp = typeof PERPS[number];

export default function TradePage() {
  const [selected, setSelected] = useState<Perp>(PERPS[0]);
  const [side, setSide]         = useState<'long' | 'short'>('long');
  const [lev, setLev]           = useState('3x');
  const [cat, setCat]           = useState('all');

  const list = cat === 'all' ? PERPS : PERPS.filter(p => p.cat === cat);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* ── Markets sidebar ── */}
      <div style={{ width: 280, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', background: C.card, flexShrink: 0 }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${C.borderLight}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 8, fontFamily: M }}>
            Markets
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {['all', 'crypto', 'commodity', 'index'].map(c => (
              <button key={c} onClick={() => setCat(c)} style={{
                padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 600, textTransform: 'capitalize', fontFamily: D,
                background: cat === c ? C.primary : C.bg,
                color: cat === c ? 'white' : C.secondary,
              }}>{c}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
          {list.map(p => (
            <div key={p.sym} onClick={() => setSelected(p)} style={{
              display: 'flex', alignItems: 'center', padding: '9px 10px', gap: 10,
              cursor: 'pointer', borderRadius: 8,
              background: selected.sym === p.sym ? C.bg : 'transparent',
              border: `1px solid ${selected.sym === p.sym ? C.border : 'transparent'}`,
              transition: 'all 0.1s',
            }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: C.bg, border: `1px solid ${C.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.secondary, fontFamily: M, flexShrink: 0 }}>
                {p.sym}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.primary, fontFamily: D }}>{p.name}</div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: M }}>
                  Fund: {p.funding > 0 ? '+' : ''}{(p.funding * 100).toFixed(4)}%
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: M, color: C.primary }}>${fmt(p.price)}</div>
                <div style={{ fontSize: 10, fontWeight: 600, fontFamily: M, color: p.chg >= 0 ? C.green : C.red }}>
                  {p.chg >= 0 ? '+' : ''}{p.chg}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Chart area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg }}>
        <div style={{ padding: '14px 20px', background: C.card, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, fontFamily: M, color: C.primary }}>
              {selected.sym}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.primary, fontFamily: D }}>
                {selected.name}{' '}
                <span style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>Perp</span>
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 10, fontFamily: M, color: C.secondary, marginTop: 1 }}>
                <span>OI {selected.oi}</span>
                <span>Funding {selected.funding > 0 ? '+' : ''}{(selected.funding * 100).toFixed(4)}%</span>
              </div>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: M, color: C.primary, letterSpacing: '-0.03em' }}>
              ${fmt(selected.price)}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: M, color: selected.chg >= 0 ? C.green : C.red }}>
              {selected.chg >= 0 ? '+' : ''}{selected.chg}%
            </div>
          </div>
        </div>

        <div style={{ flex: 1, padding: 16 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 10, background: C.card, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: C.muted }}>
              <div style={{ fontSize: 32, marginBottom: 6, opacity: 0.25 }}>📊</div>
              <div style={{ fontSize: 13, fontFamily: D }}>TradingView chart</div>
              <div style={{ fontSize: 10, fontFamily: M, marginTop: 4, color: C.border, letterSpacing: '0.08em' }}>TESTNET</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Order entry ── */}
      <div style={{ width: 260, borderLeft: `1px solid ${C.border}`, background: C.card, flexShrink: 0, padding: 16, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 14, fontFamily: M }}>Order</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.primary, fontFamily: D }}>{selected.name}</div>
          <div style={{ fontSize: 11, fontFamily: M, color: C.secondary }}>${fmt(selected.price)}</div>
        </div>

        <div style={{ display: 'flex', marginBottom: 14, background: C.bg, borderRadius: 9, padding: 3, border: `1px solid ${C.borderLight}` }}>
          {(['long', 'short'] as const).map(s => (
            <button key={s} onClick={() => setSide(s)} style={{
              flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, textTransform: 'capitalize', fontFamily: D,
              background: side === s ? C.card : 'transparent',
              color: side === s ? (s === 'long' ? C.green : C.red) : C.muted,
              boxShadow: side === s ? '0 1px 4px rgba(0,0,0,0.05)' : 'none',
              transition: 'all 0.1s',
            }}>{s}</button>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, marginBottom: 5, fontFamily: D }}>Size</div>
          <div style={{ display: 'flex', background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 7, padding: '0 10px' }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: M, lineHeight: '36px' }}>$</span>
            <input placeholder="0.00" style={{ flex: 1, border: 'none', background: 'transparent', padding: '9px 6px', fontSize: 13, fontFamily: M, fontWeight: 600, color: C.primary }} />
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, marginBottom: 5, fontFamily: D }}>Leverage</div>
          <div style={{ display: 'flex', gap: 2, background: C.bg, borderRadius: 7, padding: 2, border: `1px solid ${C.borderLight}` }}>
            {['1x', '2x', '3x', '5x', '10x', '20x'].map(l => (
              <button key={l} onClick={() => setLev(l)} style={{
                flex: 1, padding: '6px 0', borderRadius: 5, border: 'none', cursor: 'pointer',
                fontSize: 10, fontWeight: 700, fontFamily: M,
                background: lev === l ? C.card : 'transparent',
                color: lev === l ? C.primary : C.muted,
                boxShadow: lev === l ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.1s',
              }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <button style={{
            width: '100%', padding: '12px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, fontFamily: D,
            background: side === 'long' ? C.green : C.red, color: 'white',
          }}>
            {side === 'long' ? 'Long' : 'Short'} {selected.sym} {lev}
          </button>
        </div>
      </div>
    </div>
  );
}
