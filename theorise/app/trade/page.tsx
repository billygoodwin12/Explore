'use client';

import React from 'react';

export default function TradePage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 200px)',
        gap: 12,
        animation: 'fadeIn 0.4s ease',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
        }}
      >
        ⚡
      </div>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.03em',
        }}
      >
        Trade
      </h1>
      <p
        style={{
          fontSize: 14,
          color: 'var(--text-tertiary)',
          maxWidth: 340,
          textAlign: 'center',
          lineHeight: 1.6,
        }}
      >
        Hyperliquid perpetual futures with real-time data.
        Connect your wallet to get started.
      </p>
      <span
        style={{
          marginTop: 8,
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          background: 'var(--bg-surface)',
          padding: '4px 12px',
          borderRadius: 'var(--radius-full)',
        }}
      >
        TESTNET
      </span>
    </div>
  );
}
