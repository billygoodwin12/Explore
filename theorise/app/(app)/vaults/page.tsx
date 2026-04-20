'use client';

import { useState, useEffect } from 'react';
import { C, D, M, fmtK } from '@/styles/tokens';
import VaultWizard from '@/components/vaults/create/VaultWizard';
import MyVaultsModal from '@/components/vaults/MyVaultsModal';
import { useVaultCreateStore } from '@/stores/vault-create-store';

const VAULTS = [
  { name: 'Iran Oil Shock',     creator: '@MacroMike',    verified: 'twitter', positions: ['CL Long 5x', 'GC Long 3x', 'ETH Short 2x'],  perf: 14.2,  tvl: 82400,  depositors: 23,  expires: '6d 14h',  fee: 15 },
  { name: 'Rate Cut Rotation',  creator: '@BondTrader99', verified: 'kyc',     positions: ['NQ Short 3x', 'BTC Long 2x', 'GC Long 2x'],   perf: 8.7,   tvl: 214000, depositors: 67,  expires: '12d 8h',  fee: 20 },
  { name: 'AI Bubble Pop',      creator: '@TechBearish',  verified: 'twitter', positions: ['NQ Short 5x', 'SOL Short 3x'],                perf: -3.1,  tvl: 41200,  depositors: 12,  expires: '2d 1h',   fee: 10 },
  { name: 'Crypto Bull Q3',     creator: '@DeFiDegen',    verified: 'none',    positions: ['BTC Long 3x', 'ETH Long 3x', 'SOL Long 5x'],  perf: 22.8,  tvl: 156000, depositors: 89,  expires: '28d',     fee: 20 },
  { name: 'Gold Safe Haven',    creator: '@GoldMaxi',     verified: 'twitter', positions: ['GC Long 4x', 'NQ Short 2x'],                  perf: 5.4,   tvl: 93100,  depositors: 34,  expires: '19d 6h',  fee: 12 },
  { name: 'Energy Squeeze',     creator: '@CommodKing',   verified: 'kyc',     positions: ['CL Long 3x', 'NG Long 4x', 'ES Short 2x'],    perf: 31.5,  tvl: 327000, depositors: 142, expires: '9d 22h',  fee: 25 },
] as const;

function VaultCard({ v, i }: { v: typeof VAULTS[number]; i: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 30 + i * 45);
    return () => clearTimeout(t);
  }, [i]);

  return (
    <div
      style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px',
        opacity: show ? 1 : 0, transform: show ? 'translateY(0)' : 'translateY(6px)',
        transition: 'all 0.35s cubic-bezier(0.16,1,0.3,1)', cursor: 'pointer',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.accentMid; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.primary, fontFamily: D, marginBottom: 3 }}>{v.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: C.secondary, fontFamily: D }}>{v.creator}</span>
            {v.verified === 'kyc' && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: C.greenBg, color: C.greenTxt, fontFamily: M }}>KYC</span>
            )}
            {v.verified === 'twitter' && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: C.bg, color: C.secondary, fontFamily: M, border: `1px solid ${C.borderLight}` }}>𝕏</span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: M, color: v.perf >= 0 ? C.green : C.red, letterSpacing: '-0.02em' }}>
            {v.perf >= 0 ? '+' : ''}{v.perf}%
          </div>
          <div style={{ fontSize: 10, fontFamily: M, color: C.muted, marginTop: 2 }}>{v.expires}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
        {v.positions.map((pos, j) => (
          <span key={j} style={{
            fontSize: 10, fontWeight: 600, fontFamily: M, padding: '3px 8px', borderRadius: 5,
            background: pos.includes('Long') ? C.greenBg : C.redBg,
            color: pos.includes('Long') ? C.greenTxt : C.redTxt,
          }}>{pos}</span>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: C.muted, fontFamily: D }}>
          <span><span style={{ fontWeight: 700, color: C.secondary, fontFamily: M }}>{fmtK(v.tvl)}</span> TVL</span>
          <span><span style={{ fontWeight: 700, color: C.secondary, fontFamily: M }}>{v.depositors}</span> in</span>
        </div>
        <button
          style={{
            padding: '6px 16px', borderRadius: 7, cursor: 'pointer',
            fontSize: 11, fontWeight: 700, fontFamily: D,
            background: C.bg, color: C.accent, border: `1px solid ${C.border}`,
            transition: 'all 0.1s',
          }}
          onMouseEnter={e => { const b = e.currentTarget; b.style.background = C.accent; b.style.color = 'white'; b.style.borderColor = C.accent; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.background = C.bg; b.style.color = C.accent; b.style.borderColor = C.border; }}
        >Deposit</button>
      </div>
    </div>
  );
}

export default function VaultsPage() {
  const [sort, setSort] = useState('trending');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [myVaultsOpen, setMyVaultsOpen] = useState(false);
  const resetWizard = useVaultCreateStore(s => s.reset);

  const openWizard = () => {
    resetWizard();
    setWizardOpen(true);
  };
  const closeWizard = () => setWizardOpen(false);

  const sorted = [...VAULTS].sort((a, b) => {
    if (sort === 'performance') return b.perf - a.perf;
    if (sort === 'tvl') return b.tvl - a.tvl;
    return b.depositors - a.depositors;
  });

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: C.bg }}>

      {/* Create vault banner */}
      <div style={{ padding: '24px 28px 0' }}>
        <div style={{
          padding: '28px 32px', borderRadius: 14,
          background: `linear-gradient(135deg, ${C.hero1} 0%, ${C.hero2} 50%, ${C.hero3} 100%)`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Decorative lines */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} style={{
                position: 'absolute', right: `${i * 8}%`, top: '-20%', width: 1, height: '140%',
                background: `linear-gradient(180deg, transparent, rgba(255,255,255,${0.03 + i * 0.01}), transparent)`,
                transform: `rotate(${-20 + i * 3}deg)`,
              }} />
            ))}
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.95)', fontFamily: D, letterSpacing: '-0.02em' }}>
              Create a vault
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: D, marginTop: 4, maxWidth: 340 }}>
              Package your positions into a time-bound, strategy-locked vault and share it with the world.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, position: 'relative', zIndex: 1 }}>
            <button
              onClick={() => setMyVaultsOpen(true)}
              style={{
                padding: '12px 20px', borderRadius: 9, cursor: 'pointer',
                fontSize: 13, fontWeight: 700, fontFamily: D,
                background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)',
                border: '1px solid rgba(255,255,255,0.18)', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.14)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
            >My vaults</button>
            <button
              onClick={openWizard}
              style={{
                padding: '12px 28px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 700, fontFamily: D,
                background: 'white', color: C.primary,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
            >+ Create vault</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: '20px 28px 0', display: 'flex', gap: 12 }}>
        {[
          { label: 'Active',     value: '142',     sub: 'vaults' },
          { label: 'TVL',        value: '$2.4M',   sub: 'deposited' },
          { label: 'Settled',    value: '38',      sub: 'this week' },
          { label: 'Avg Return', value: '+11.2%',  sub: 'on settled' },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, padding: '14px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, fontFamily: M, marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: M, color: C.primary, letterSpacing: '-0.02em' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: D, marginTop: 1 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Explore header + sort */}
      <div style={{ padding: '24px 28px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.primary, fontFamily: D, letterSpacing: '-0.02em' }}>Explore</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {[['trending', 'Trending'], ['performance', 'Top Returns'], ['tvl', 'Most Funded']].map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)} style={{
                padding: '6px 14px', borderRadius: 7, cursor: 'pointer',
                fontSize: 11, fontWeight: 600, fontFamily: D,
                background: sort === k ? C.primary : C.card,
                color: sort === k ? 'white' : C.secondary,
                border: sort === k ? 'none' : `1px solid ${C.border}`,
                transition: 'all 0.1s',
              }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Vault grid */}
      <div style={{ padding: '0 28px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {sorted.map((v, i) => <VaultCard key={v.name} v={v} i={i} />)}
      </div>

      {wizardOpen && <VaultWizard onClose={closeWizard} />}
      {myVaultsOpen && <MyVaultsModal onClose={() => setMyVaultsOpen(false)} />}
    </div>
  );
}
