'use client';

import React from 'react';
import WalletButton from '@/components/wallet/WalletButton';

export default function Header() {
  return (
    <header
      style={{
        height: 54,
        position: 'sticky',
        top: 0,
        zIndex: 10,
        borderBottom: '1px solid #eeedea',
        background: '#fff',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      {/* Left: Logo + Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: '#1a1917',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          T
        </div>
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: '#1a1917',
            letterSpacing: '-0.02em',
          }}
        >
          Theorise
        </span>
      </div>

      {/* Right: Wallet */}
      <WalletButton />
    </header>
  );
}
