'use client';

import { C, D, M } from '@/styles/tokens';
import { useMarketData, type MarketData } from '@/hooks/useMarketData';
import { usePositions } from '@/hooks/usePositions';
import {
  useVaultCreateStore,
  calcMinDeploy,
  calcTotalIM,
  totalAlloc,
  rebalanceAlloc,
  evenAlloc,
  type VaultPosition,
  type Lev,
  type Dir,
} from '@/stores/vault-create-store';

const LEV_OPTS: Lev[] = [1, 2, 3, 5, 10, 20];
const ALLOC_COLORS = ['#3D5A80', '#0D9B6B', '#D14343', '#F59E0B', '#7C3AED', '#0891B2'];

const fmt = (n: number) => {
  const r = Math.round(n * 100) / 100;
  if (r >= 1000) return '$' + r.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return '$' + r.toFixed(2).replace(/\.00$/, '');
};

function PositionRow({
  pos, idx, deploySize, onAllocChange, onLevChange, onDirChange, onRemove,
}: {
  pos: VaultPosition; idx: number; deploySize: number;
  onAllocChange: (idx: number, val: number) => void;
  onLevChange: (idx: number, lev: Lev) => void;
  onDirChange: (idx: number, dir: Dir) => void;
  onRemove: (idx: number) => void;
}) {
  const notional = deploySize * (pos.alloc / 100);
  const im = notional / pos.lev;
  const color = ALLOC_COLORS[idx % ALLOC_COLORS.length];

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.borderLight}`,
      borderRadius: 10, padding: '12px 14px', marginBottom: 6,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: M, color: C.primary, minWidth: 36 }}>
          {pos.sym}
        </div>
        <div style={{
          display: 'flex', background: C.bg, borderRadius: 6, padding: 2,
          border: `1px solid ${C.borderLight}`, gap: 2,
        }}>
          {(['long', 'short'] as Dir[]).map(dir => (
            <button
              key={dir}
              onClick={() => onDirChange(idx, dir)}
              style={{
                padding: '3px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                fontSize: 10, fontWeight: 700, fontFamily: M,
                background: pos.dir === dir ? (dir === 'long' ? C.greenBg : C.redBg) : 'transparent',
                color: pos.dir === dir ? (dir === 'long' ? C.greenTxt : C.redTxt) : C.muted,
                transition: 'all 0.1s',
              }}
            >
              {dir.charAt(0).toUpperCase() + dir.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, fontSize: 11, color: C.secondary, fontFamily: D }}>{pos.name}</div>
        <button
          onClick={() => onRemove(idx)}
          style={{
            width: 20, height: 20, borderRadius: '50%', border: `1px solid ${C.borderLight}`,
            background: 'transparent', cursor: 'pointer', fontSize: 11, color: C.muted,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: C.muted, fontFamily: D }}>Allocation</span>
            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: M, color: C.primary }}>{pos.alloc}%</span>
          </div>
          <input
            type="range" min={5} max={90} step={1} value={pos.alloc}
            onChange={e => onAllocChange(idx, parseInt(e.target.value))}
            style={{ width: '100%', accentColor: color }}
          />
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: D, marginBottom: 5 }}>Leverage</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {LEV_OPTS.map(l => (
              <button
                key={l}
                onClick={() => onLevChange(idx, l)}
                style={{
                  flex: 1, padding: '4px 0', borderRadius: 5,
                  border: `1px solid ${pos.lev === l ? C.primary : C.borderLight}`,
                  cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: M,
                  background: pos.lev === l ? C.primary : C.bg,
                  color: pos.lev === l ? '#fff' : C.muted,
                  transition: 'all 0.1s',
                }}
              >
                {l}x
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: M }}>
          Notional: <span style={{ color: C.primary, fontWeight: 600 }}>{fmt(notional)}</span>
        </div>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: M }}>
          IM: <span style={{ color: C.primary, fontWeight: 600 }}>{fmt(im)}</span>
        </div>
      </div>
    </div>
  );
}

function DeployCard({ positions, deploySize, onSizeChange }: {
  positions: VaultPosition[]; deploySize: number; onSizeChange: (val: number) => void;
}) {
  const minDeploy = calcMinDeploy(positions);
  const effectiveSize = Math.max(deploySize, minDeploy);
  const im = calcTotalIM(positions, effectiveSize);
  const maxSlider = Math.max(effectiveSize * 4, minDeploy * 20, 10000);

  return (
    <div style={{
      border: `1.5px solid ${C.accentMid}`, borderRadius: 12,
      padding: '16px 18px', background: C.card,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.secondary, fontFamily: M, marginBottom: 3 }}>
            Your deployment
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, fontFamily: M, color: C.primary, letterSpacing: '-0.03em', lineHeight: 1 }}>
            {fmt(effectiveSize)}
          </div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: D, marginTop: 3 }}>
            Initial margin required:{' '}
            <strong style={{ color: C.primary, fontWeight: 700 }}>{fmt(im)}</strong> USDC
          </div>
        </div>
        <div style={{
          background: '#EBF4FF', color: '#1A56A0', fontSize: 10, fontWeight: 700,
          padding: '3px 8px', borderRadius: 5, fontFamily: M, whiteSpace: 'nowrap',
        }}>
          Min: {fmt(minDeploy)}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: C.muted, fontFamily: M, whiteSpace: 'nowrap' }}>{fmt(minDeploy)}</span>
        <input
          type="range" min={minDeploy} max={maxSlider} step={10}
          value={effectiveSize}
          onChange={e => onSizeChange(Math.max(parseInt(e.target.value), minDeploy))}
          style={{ flex: 1, accentColor: C.accent }}
        />
        <span style={{ fontSize: 10, color: C.muted, fontFamily: M, whiteSpace: 'nowrap' }}>{fmt(maxSlider)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: C.secondary, fontFamily: D }}>Exact amount:</span>
        <div style={{
          display: 'flex', alignItems: 'center',
          background: C.bg, border: `1px solid ${C.borderLight}`,
          borderRadius: 8, padding: '0 10px', gap: 4,
        }}>
          <span style={{ fontSize: 13, color: C.muted, fontFamily: M }}>$</span>
          <input
            type="number" value={effectiveSize} min={minDeploy} step={10}
            onChange={e => {
              const val = parseInt(e.target.value) || 0;
              if (val >= minDeploy) onSizeChange(val);
            }}
            style={{
              border: 'none', background: 'transparent', fontSize: 13,
              fontFamily: M, color: C.primary, outline: 'none', padding: '8px 0', width: 90,
            }}
          />
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 10 }}>
        {positions.map((p, i) => {
          const notional = effectiveSize * (p.alloc / 100);
          const posIM = notional / p.lev;
          return (
            <div key={p.sym} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 11, marginBottom: 5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontFamily: M, color: ALLOC_COLORS[i % ALLOC_COLORS.length] }}>
                  {p.sym}
                </span>
                <span style={{ color: C.muted, fontFamily: M }}>
                  {p.dir === 'long' ? 'L' : 'S'} {p.lev}x · {p.alloc}%
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontFamily: M, color: C.primary }}>{fmt(notional)}</div>
                <div style={{ color: C.muted, fontFamily: M, fontSize: 10 }}>IM: {fmt(posIM)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderTop: `1px solid ${C.borderLight}`, paddingTop: 10, marginTop: 6,
      }}>
        <span style={{ fontSize: 11, color: C.secondary, fontFamily: D }}>Total initial margin</span>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: M, color: C.primary }}>{fmt(im)} USDC</span>
      </div>
    </div>
  );
}

function PortfolioImport({ existingSyms, onImport, markets }: {
  existingSyms: string[];
  onImport: (sym: string, name: string, dir: Dir, lev: Lev) => void;
  markets: MarketData[];
}) {
  const { positions: walletPositions } = usePositions();

  const available = walletPositions.filter(p => {
    const sym = p.coin.includes(':') ? p.coin.split(':')[1] : p.coin;
    return !existingSyms.includes(sym) && !existingSyms.includes(p.coin);
  });

  if (!available.length) return null;

  return (
    <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 10, overflow: 'hidden', marginTop: 12 }}>
      <div style={{
        padding: '9px 13px', background: C.bg, borderBottom: `1px solid ${C.borderLight}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.secondary, fontFamily: D }}>
          Import from your portfolio
        </span>
        <span style={{ fontSize: 10, color: C.muted, fontFamily: D }}>tap to add</span>
      </div>
      {available.map(p => {
        const szi = parseFloat(p.szi);
        const dir: Dir = szi > 0 ? 'long' : 'short';
        const levVal = p.leverage.value;
        const closestLev = LEV_OPTS.reduce((a, b) => Math.abs(b - levVal) < Math.abs(a - levVal) ? b : a);
        const displaySym = p.coin.includes(':') ? p.coin.split(':')[1] : p.coin;
        const mkt = markets.find(m => m.sym === p.coin);
        const pnl = parseFloat(p.unrealizedPnl);

        return (
          <div
            key={p.coin}
            onClick={() => onImport(displaySym, mkt?.name ?? displaySym, dir, closestLev)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px',
              borderBottom: `1px solid ${C.borderLight}`, cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.bg; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: M, color: C.primary, width: 34 }}>
              {displaySym}
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, fontFamily: M,
              background: dir === 'long' ? C.greenBg : C.redBg,
              color: dir === 'long' ? C.greenTxt : C.redTxt,
            }}>
              {dir === 'long' ? 'Long' : 'Short'} {closestLev}x
            </span>
            <div style={{ flex: 1, fontSize: 11, color: C.secondary, fontFamily: D }}>{mkt?.name ?? displaySym}</div>
            <div style={{
              fontSize: 11, fontWeight: 700, fontFamily: M,
              color: pnl >= 0 ? C.green : C.red,
            }}>
              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
            </div>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', border: `1px solid ${C.borderLight}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: C.secondary, flexShrink: 0,
            }}>
              +
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Step1Strategy() {
  const { positions, deploySize, name, setPositions, setDeploySize, setName } = useVaultCreateStore();
  const { markets } = useMarketData();
  const allocOk = totalAlloc(positions) === 100;
  const existingSyms = positions.map(p => p.sym);

  const handleAllocChange = (idx: number, val: number) => {
    setPositions(rebalanceAlloc(positions, idx, val));
  };

  const handleLevChange = (idx: number, lev: Lev) => {
    setPositions(positions.map((p, i) => i === idx ? { ...p, lev } : p));
  };

  const handleDirChange = (idx: number, dir: Dir) => {
    setPositions(positions.map((p, i) => i === idx ? { ...p, dir } : p));
  };

  const handleRemove = (idx: number) => {
    const next = positions.filter((_, i) => i !== idx);
    if (next.length) {
      const allocs = evenAlloc(next.length);
      setPositions(next.map((p, i) => ({ ...p, alloc: allocs[i] })));
    } else {
      setPositions([]);
    }
  };

  const handleAdd = (sym?: string, name?: string, dir?: Dir, lev?: Lev) => {
    const avail = markets
      .filter(m => !existingSyms.includes(m.displaySym) && !existingSyms.includes(m.sym))
      .map(m => ({ sym: m.displaySym, name: m.name }));
    if (!avail.length && !sym) return;
    const s = sym ?? avail[0].sym;
    const n = name ?? avail[0].name;
    const newPos: VaultPosition[] = [...positions, { sym: s, name: n, dir: dir ?? 'long', lev: lev ?? 3, alloc: 0 }];
    const allocs = evenAlloc(newPos.length);
    setPositions(newPos.map((p, i) => ({ ...p, alloc: allocs[i] })));
  };

  const handleImport = (sym: string, name: string, dir: Dir, lev: Lev) => {
    handleAdd(sym, name, dir, lev);
  };

  // Instrument picker for "+ Add position"
  const availableInstruments = markets.filter(
    m => !existingSyms.includes(m.displaySym) && !existingSyms.includes(m.sym),
  );

  return (
    <div>
      <div style={{
        background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 8,
        padding: '9px 12px', fontSize: 11, color: C.secondary, fontFamily: D,
        lineHeight: 1.6, marginBottom: 12,
      }}>
        Positions deploy as net new orders on Hyperliquid when your vault activates.
        Import from your portfolio as a starting point — adjust leverage and sizing freely before deploying.
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, fontFamily: D, marginBottom: 6 }}>
          Vault name
        </div>
        <input
          type="text" value={name} maxLength={60}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Iran Oil Shock"
          style={{
            width: '100%', padding: '8px 11px', borderRadius: 8,
            border: `1px solid ${C.borderLight}`, fontSize: 13, fontFamily: D,
            color: C.primary, background: C.bg, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ height: 1, background: C.borderLight, margin: '14px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, fontFamily: D }}>
          Positions & allocation
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: M,
          background: allocOk ? C.greenBg : C.redBg,
          color: allocOk ? C.greenTxt : C.redTxt,
        }}>
          {totalAlloc(positions)}%{allocOk ? ' \u2713' : ' \u2190 must = 100%'}
        </div>
      </div>

      {positions.length > 0 && (
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 10, gap: 1 }}>
          {positions.map((p, i) => (
            <div key={p.sym} style={{
              width: `${p.alloc}%`, height: '100%', borderRadius: 2,
              background: ALLOC_COLORS[i % ALLOC_COLORS.length], transition: 'width 0.15s',
            }} />
          ))}
        </div>
      )}

      {positions.map((p, i) => (
        <PositionRow
          key={p.sym} pos={p} idx={i}
          deploySize={Math.max(deploySize, calcMinDeploy(positions))}
          onAllocChange={handleAllocChange}
          onLevChange={handleLevChange}
          onDirChange={handleDirChange}
          onRemove={handleRemove}
        />
      ))}

      {availableInstruments.length > 0 && (
        <button
          onClick={() => handleAdd()}
          style={{
            width: '100%', padding: 9, borderRadius: 8,
            border: `1px dashed ${C.border}`, background: 'transparent',
            cursor: 'pointer', fontSize: 12, color: C.secondary, fontFamily: D, marginTop: 2,
          }}
        >
          + Add position
        </button>
      )}

      <PortfolioImport existingSyms={existingSyms} onImport={handleImport} markets={markets} />

      <div style={{ height: 1, background: C.borderLight, margin: '14px 0' }} />

      {positions.length > 0 && (
        <DeployCard
          positions={positions}
          deploySize={deploySize}
          onSizeChange={setDeploySize}
        />
      )}
    </div>
  );
}
