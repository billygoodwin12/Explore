'use client';

import { memo, useMemo, useState } from 'react';
import { C, D, M } from '@/styles/tokens';
import type { MarketData } from '@/hooks/useMarketData';

const POPULAR_COUNT = 5;
const REST_CAP = 40;

const fmtVol = (v: number) => {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

interface PickerItem {
  sym: string;
  name: string;
  volume: number;
  cat: string;
  dex?: string;
}

const PickerRow = memo(function PickerRow({ item, checked, onToggle }: {
  item: PickerItem; checked: boolean; onToggle: (sym: string) => void;
}) {
  return (
    <div
      onClick={() => onToggle(item.sym)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px',
        borderBottom: `1px solid ${C.borderLight}`, cursor: 'pointer',
        background: checked ? '#F0F5FA' : 'transparent',
        transition: 'background 0.08s',
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        border: `1.5px solid ${checked ? C.accent : C.border}`,
        background: checked ? C.accent : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: '#fff', fontWeight: 700,
      }}>
        {checked ? '\u2713' : ''}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, fontFamily: M, color: C.primary, width: 60 }}>
        {item.sym}
      </div>
      <div style={{ flex: 1, fontSize: 11, color: C.secondary, fontFamily: D, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.name}
      </div>
      {item.dex && (
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          fontFamily: M, background: C.bg, color: C.muted, border: `1px solid ${C.borderLight}`,
        }}>
          {item.dex}
        </span>
      )}
      <div style={{ fontSize: 10, color: C.muted, fontFamily: M, width: 60, textAlign: 'right' }}>
        {fmtVol(item.volume)}
      </div>
    </div>
  );
});

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 13px', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      color: C.muted, fontFamily: M, background: C.bg,
      borderBottom: `1px solid ${C.borderLight}`,
    }}>
      {children}
    </div>
  );
}

export default function AddPositionPicker({ available, onClose, onConfirm }: {
  available: MarketData[];
  onClose: () => void;
  onConfirm: (selected: { sym: string; name: string }[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const items: PickerItem[] = useMemo(
    () => available.map(m => ({
      sym: m.displaySym,
      name: m.name,
      volume: m.volume,
      cat: m.cat,
      dex: m.dex,
    })),
    [available],
  );

  const { popular, rest } = useMemo(() => {
    const byVolume = [...items].sort((a, b) => b.volume - a.volume);
    const q = query.trim().toLowerCase();

    if (q) {
      const matches = items.filter(it =>
        it.sym.toLowerCase().includes(q) || it.name.toLowerCase().includes(q),
      );
      return { popular: [] as PickerItem[], rest: matches.slice(0, REST_CAP * 2) };
    }

    const popular = byVolume.slice(0, POPULAR_COUNT);
    const popularSyms = new Set(popular.map(p => p.sym));
    const rest = byVolume.filter(p => !popularSyms.has(p.sym)).slice(0, REST_CAP);
    return { popular, rest };
  }, [items, query]);

  const toggle = (sym: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym); else next.add(sym);
      return next;
    });
  };

  const handleConfirm = () => {
    const picks = items.filter(it => selected.has(it.sym)).map(it => ({ sym: it.sym, name: it.name }));
    onConfirm(picks);
  };

  const totalShown = popular.length + rest.length;
  const remainingHidden = Math.max(0, items.length - totalShown);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(27,42,61,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.card, borderRadius: 16, width: 480, maxWidth: '100%',
          border: `1px solid ${C.borderLight}`, fontFamily: D,
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '18px 22px 12px', borderBottom: `1px solid ${C.borderLight}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.primary, fontFamily: D }}>
              Add positions
            </div>
            <button
              onClick={onClose}
              style={{
                width: 26, height: 26, borderRadius: '50%',
                border: `1px solid ${C.borderLight}`, background: C.bg,
                cursor: 'pointer', fontSize: 12, color: C.secondary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {'\u2715'}
            </button>
          </div>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search BTC, NVDA, MSTR..."
            style={{
              width: '100%', padding: '9px 11px', borderRadius: 8,
              border: `1px solid ${C.borderLight}`, fontSize: 12, fontFamily: D,
              color: C.primary, background: C.bg, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {popular.length > 0 && <SectionLabel>Popular \u00b7 by 24h volume</SectionLabel>}
          {popular.map(it => (
            <PickerRow key={it.sym} item={it} checked={selected.has(it.sym)} onToggle={toggle} />
          ))}
          {rest.length > 0 && !query && <SectionLabel>All instruments</SectionLabel>}
          {rest.map(it => (
            <PickerRow key={it.sym} item={it} checked={selected.has(it.sym)} onToggle={toggle} />
          ))}
          {!query && remainingHidden > 0 && (
            <div style={{
              padding: '10px 13px', fontSize: 10, color: C.muted, fontFamily: D, textAlign: 'center',
            }}>
              +{remainingHidden} more \u2014 search to find them
            </div>
          )}
          {totalShown === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: C.muted, fontFamily: D }}>
              No matches for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        <div style={{
          padding: '12px 22px', borderTop: `1px solid ${C.borderLight}`,
          display: 'flex', gap: 8, flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10,
              border: `1px solid ${C.borderLight}`, cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: D,
              background: C.bg, color: C.secondary,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 10, border: 'none',
              cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 700, fontFamily: D,
              background: C.primary, color: '#fff',
              opacity: selected.size === 0 ? 0.4 : 1,
            }}
          >
            {selected.size === 0 ? 'Select instruments' : `Add ${selected.size} selected`}
          </button>
        </div>
      </div>
    </div>
  );
}
