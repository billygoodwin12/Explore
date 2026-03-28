'use client';

import React, { useState } from 'react';

export default function WalletButton() {
  const [connected, setConnected] = useState(false);

  return (
    <button
      onClick={() => setConnected(!connected)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        borderRadius: 9,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'var(--mono)',
        border: connected ? '1px solid #bbf7d0' : '1px solid #eeedea',
        background: connected ? '#ecfdf5' : '#f7f6f3',
        color: connected ? '#059669' : '#8a8680',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: connected ? '#22c55e' : '#d5d3cf',
          boxShadow: connected ? '0 0 6px rgba(34,197,94,0.4)' : 'none',
        }}
      />
      {connected ? '0x7a3F...c92E' : 'Connect wallet'}
    </button>
  );
}
