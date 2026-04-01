'use client';

import React from 'react';
import WalletButton from '@/components/wallet/WalletButton';
import TabNavigation from './TabNavigation';

export default function Header() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Main header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          height: 56,
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-md)',
              background: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: 'var(--text-inverse)',
                lineHeight: 1,
              }}
            >
              T
            </span>
          </div>
          <span
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
            }}
          >
            Theorise
          </span>
        </div>

        {/* Center: Tab nav (hidden on mobile) */}
        <TabNavigation />

        {/* Right: Wallet */}
        <WalletButton />
      </div>
    </header>
  );
}
