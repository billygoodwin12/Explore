'use client';

import { useMemo, useState } from 'react';
import { C, D, M } from '@/styles/tokens';
import type { MarketData } from '@/hooks/useMarketData';

const POPULAR_COUNT = 5;

const fmtVol = (v: number) => {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

export interface PickedInstrument {
  sym: string;
  name: string;
}

export default function AddPositionPicker({
  markets, existingSyms, onClose, onAdd,
}: {
  markets: MarketData[];
  existingSyms: string[];
  onClose: () => void;
  onAdd: (picks: PickedInstrument[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const available = useMemo(
    () => markets
      .filter(m => !existingSyms.includes(m.displaySym) && !existingSyms.includes(m.sym))
      .slice()
      .sort((a, b) => b.volume - a.volume),
    [markets, existingSyms],
  );

  const popular = available.slice(0, POPULAR_COUNT);
  const popularKeys = new Set(popular.map(m => m.sym));

  const q = query.trim().toLowerCase();
  const rest = available.filter(m =>
    !popularKeys.has(m.sym) &&
    (q === '' ||
      m.displaySym.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q)),
  );
  const filteredPopular = q === ''
    ? popular
    : popular.filter(m =>
        m.displaySym.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
      );

  const toggle = (sym: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym); else next.add(sym);
      return next;
    });
  };

  const handleConfirm = () => {
    const picks: PickedInstrument[] = available
      .filter(m => selected.has(m.sym))
      .map(m => ({ sym: m.displaySym, name: m.name }));
    onAdd(picks);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        background: 'rgba(27,42,61,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.card, borderRadius: 14, width: 480, maxWidth: '100%',
          border: `1px solid ${C.borderLight}`, fontFamily: D,
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px 12px', display: 'flex',
          justifyContent: 'space-between', alignItems: 'flex-start',
          borderBottom: `1px solid ${C.borderLight}`, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.primary }}>
              Add positions
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              Pick one or more instruments to add to your vault.
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
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

        {/* Search */}
        <div style={{ padding: '12px 22px 0', flexShrink: 0 }}>
          <input
            type="text" value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search BTC, Ethereum, SOL..."
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: `1px solid ${C.borderLight}`, fontSize: 13, fontFamily: D,
              color: C.primary, background: C.bg, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Body */}
        <div style={{ padding: '12px 22px 0', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {filteredPopular.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: C.secondary, marginBottom: 6,
              }}>
                Most popular
              </div>
              <div style={{
                background: '#F8FAFD',
                border: `1px solid ${C.borderLight}`,
                borderRadius: 10, padding: 4,
              }}>
                {filteredPopular.map(m => (
                  <PickerRow
                    key={m.sym}
                    market={m}
                    checked={selected.has(m.sym)}
                    onToggle={() => toggle(m.sym)}
                    highlight
                  />
                ))}
              </div>
            </div>
          )}

          {rest.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: C.secondary, marginBottom: 6,
              }}>
                All instruments
              </div>
              <div>
                {rest.map(m => (
                  <PickerRow
                    key={m.sym}
                    market={m}
                    checked={selected.has(m.sym)}
                    onToggle={() => toggle(m.sym)}
                  />
                ))}
              </div>
            </div>
          )}

          {filteredPopular.length === 0 && rest.length === 0 && (
            <div style={{
              padding: '22px 0', textAlign: 'center',
              fontSize: 12, color: C.muted,
            }}>
              No matches.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 22px 18px', display: 'flex', gap: 8, flexShrink: 0,
          borderTop: `1px solid ${C.borderLight}`,
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
              transition: 'opacity 0.15s',
            }}
          >
            Add {selected.size > 0 ? `${selected.size} selected` : 'selected'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PickerRow({
  market, checked, onToggle, highlight,
}: {
  market: MarketData; checked: boolean; onToggle: () => void; highlight?: boolean;
}) {
  return (
    <label
      onClick={(e) => { e.preventDefault(); onToggle(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
        background: checked ? '#EBF4FF' : highlight ? 'transparent' : 'transparent',
        border: checked ? `1px solid ${C.accent}` : '1px solid transparent',
        marginBottom: 2, transition: 'background 0.1s, border-color 0.1s',
      }}
      onMouseEnter={e => {
        if (!checked) e.currentTarget.style.background = highlight ? '#EEF2F7' : C.bg;
      }}
      onMouseLeave={e => {
        if (!checked) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span
        style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
          border: `1.5px solid ${checked ? C.accent : C.border}`,
          background: checked ? C.accent : '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 11, fontWeight: 700,
        }}
      >
        {checked ? '\u2713' : ''}
      </span>
      <span style={{
        fontSize: 12, fontWeight: 700, fontFamily: M,
        color: C.primary, minWidth: 46,
      }}>
        {market.displaySym}
      </span>
      <span style={{
        flex: 1, fontSize: 12, color: C.secondary, fontFamily: D,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {market.name}
      </span>
      <span style={{
        fontSize: 10, color: C.muted, fontFamily: M, whiteSpace: 'nowrap',
      }}>
        24h vol {fmtVol(market.volume)}
      </span>
    </label>
  );
}
