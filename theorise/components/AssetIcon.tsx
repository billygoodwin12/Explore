'use client';

import { useState } from 'react';
import { C, M } from '@/styles/tokens';

interface Props {
  sym: string;
  size?: number;
}

/**
 * Asset logo pulled from Hyperliquid's public CDN
 * (e.g. https://app.hyperliquid.xyz/coins/BTC.svg). Falls back to a
 * text tile with the first three characters of the symbol if the
 * image fails to load.
 */
export default function AssetIcon({ sym, size = 34 }: Props) {
  const [failed, setFailed] = useState(false);

  const commonStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.24),
    background: C.bg,
    border: `1px solid ${C.borderLight}`,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  if (failed) {
    return (
      <div style={commonStyle}>
        <span style={{
          fontSize: Math.max(9, Math.round(size * 0.32)),
          fontWeight: 700,
          color: C.secondary,
          fontFamily: M,
        }}>
          {sym.slice(0, 3).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <div style={commonStyle}>
      <img
        src={`https://app.hyperliquid.xyz/coins/${sym}.svg`}
        alt={sym}
        width={Math.round(size * 0.72)}
        height={Math.round(size * 0.72)}
        onError={() => setFailed(true)}
        style={{ objectFit: 'contain' }}
      />
    </div>
  );
}
