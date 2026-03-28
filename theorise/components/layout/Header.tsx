'use client';

import React from 'react';
import WalletButton from '@/components/wallet/WalletButton';

export default function Header() {
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-4 md:px-6 border-b"
      style={{
        height: '56px',
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(0, 0, 0, 0.08)',
      }}
    >
      {/* Left: Logo + App Name */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
          style={{
            background: 'linear-gradient(135deg, #6B5CE7, #4F46E5)',
          }}
        >
          T
        </div>
        <span
          className="font-semibold text-base"
          style={{ color: '#1a1a1a' }}
        >
          Theorise
        </span>
      </div>

      {/* Right: Wallet */}
      <WalletButton />
    </header>
  );
}
