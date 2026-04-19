'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { C, D, M } from '@/styles/tokens';
import { useVaultCreateStore, calcMinIM, calcTotalNotional } from '@/stores/vault-create-store';
import { useCreateVault } from '@/hooks/useCreateVault';
import { formatUnits } from 'viem';

const MODE_LABELS: Record<string, string> = {
  HARD: 'Hard expiry',
  SOFT: 'Soft expiry + 48hr window',
  CREATOR: 'Creator close (24hr notice)',
};

const fmt = (n: number) => {
  const r = Math.round(n * 100) / 100;
  if (r >= 1000) return '$' + r.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return '$' + r.toFixed(2).replace(/\.00$/, '');
};

function SliderField({ label, value, min, max, step, onChange, helper, disabled }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; helper?: string; disabled?: boolean;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, fontFamily: D }}>{label}</div>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: M, color: disabled ? C.muted : C.primary }}>
          {disabled ? 'N/A' : `${value}%`}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={disabled ? 0 : value}
        onChange={e => onChange(parseInt(e.target.value))}
        disabled={disabled}
        style={{ width: '100%', accentColor: disabled ? C.muted : C.accent, opacity: disabled ? 0.4 : 1 }}
      />
      {helper && (
        <div style={{ fontSize: 10, color: C.muted, fontFamily: D, marginTop: 4 }}>{helper}</div>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '7px 0',
      borderBottom: `1px solid ${C.borderLight}`, fontSize: 12,
    }}>
      <span style={{ color: C.secondary, fontFamily: D }}>{label}</span>
      <span style={{ fontWeight: 600, color: C.primary, fontFamily: M, textAlign: 'right', maxWidth: '60%' }}>
        {value}
      </span>
    </div>
  );
}

export default function Step3Fees() {
  const s = useVaultCreateStore();
  const { deploymentFee } = useCreateVault();
  const totalNotional = calcTotalNotional(s.positions, s.deployIM);
  const minIM = calcMinIM(s.positions);
  const feeUsdc = deploymentFee !== null ? parseFloat(formatUnits(deploymentFee, 6)) : null;
  const totalDue = feeUsdc !== null ? s.deployIM + feeUsdc : null;
  const posStr = s.positions
    .map(p => `${p.sym} ${p.dir === 'long' ? 'L' : 'S'} ${p.lev}x ${p.alloc}%`)
    .join(', ');

  const [inputVal, setInputVal] = useState(String(s.minDeposit));
  const focusedRef = useRef(false);

  // If configured floor is below what positions require, raise it to the min.
  useEffect(() => {
    if (s.minDeposit < minIM) s.setMinDeposit(minIM);
  }, [minIM, s]);

  useEffect(() => {
    if (!focusedRef.current) setInputVal(String(s.minDeposit));
  }, [s.minDeposit]);

  const commitMinDeposit = useCallback(() => {
    focusedRef.current = false;
    const parsed = parseInt(inputVal.replace(/[^0-9]/g, ''), 10);
    const next = Number.isFinite(parsed) ? Math.max(parsed, minIM) : minIM;
    s.setMinDeposit(next);
    setInputVal(String(next));
  }, [inputVal, minIM, s]);

  return (
    <div>
      <SliderField
        label="Performance fee" value={s.perfFee} min={0} max={30} step={1}
        onChange={s.setPerfFee}
        helper="Only charged on profit at settlement. You keep 80%; 20% goes to the platform."
      />
      <SliderField
        label="Early exit fee" value={s.exitFee} min={0} max={5} step={1}
        onChange={s.setExitFee}
        disabled={s.settlementMode === 'HARD'}
        helper={s.settlementMode === 'HARD'
          ? 'Not applicable for hard expiry vaults.'
          : 'Applied to depositors who withdraw before settlement.'}
      />

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, fontFamily: D, marginBottom: 6 }}>
          Min deposit per depositor (USDC)
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          background: C.bg, border: `1px solid ${C.borderLight}`,
          borderRadius: 8, padding: '0 10px', gap: 4,
        }}>
          <span style={{ fontSize: 13, color: C.muted, fontFamily: M }}>$</span>
          <input
            type="text"
            inputMode="numeric"
            value={inputVal}
            onFocus={() => { focusedRef.current = true; }}
            onChange={e => setInputVal(e.target.value)}
            onBlur={commitMinDeposit}
            onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
            style={{
              border: 'none', background: 'transparent', fontSize: 13,
              fontFamily: M, color: C.primary, outline: 'none', padding: '8px 0', width: 90,
            }}
          />
        </div>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: D, marginTop: 4 }}>
          Must be {'\u2265'} ${minIM} (IM) so every position covers the $10 minimum order on Hyperliquid.
        </div>
      </div>

      <div style={{ height: 1, background: C.borderLight, margin: '14px 0' }} />

      <div style={{ fontSize: 13, fontWeight: 600, color: C.primary, fontFamily: D, marginBottom: 10 }}>
        Review
      </div>

      <ReviewRow label="Vault name" value={s.name || '\u2014'} />
      <ReviewRow label="Positions" value={posStr || '\u2014'} />
      <ReviewRow label="Your collateral (IM)" value={`${fmt(s.deployIM)} USDC`} />
      <ReviewRow label="Total notional" value={fmt(totalNotional)} />
      {feeUsdc !== null && feeUsdc > 0 && (
        <ReviewRow label="Platform deployment fee" value={`${fmt(feeUsdc)} USDC`} />
      )}
      {totalDue !== null && feeUsdc !== null && feeUsdc > 0 && (
        <ReviewRow label="Total due at deploy" value={`${fmt(totalDue)} USDC`} />
      )}
      <ReviewRow label="Timeframe" value={s.timeframe} />
      <ReviewRow label="Settlement" value={MODE_LABELS[s.settlementMode]} />
      <ReviewRow label="Performance fee" value={`${s.perfFee}% (80% to you / 20% to platform)`} />
      <ReviewRow label="Early exit fee" value={s.settlementMode === 'HARD' ? 'N/A' : `${s.exitFee}%`} />
      <ReviewRow label="Min deposit" value={`$${s.minDeposit} USDC`} />

      <div style={{
        background: C.amberBg, border: `1px solid ${C.amber}`, borderRadius: 8,
        padding: '9px 12px', fontSize: 11, color: C.amberTxt, fontFamily: D,
        lineHeight: 1.6, marginTop: 10,
      }}>
        Strategy, leverage, and allocation are immutable after deployment.
        Net new positions will be placed on Hyperliquid when the vault activates.
      </div>
    </div>
  );
}
