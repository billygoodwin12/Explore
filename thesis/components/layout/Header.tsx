'use client';

import React from 'react';
import WalletButton from '@/components/wallet/WalletButton';

interface HeaderProps {
  activePositions?: number;
}

export default function Header({ activePositions = 0 }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-50 h-16 flex items-center justify-between px-4 md:px-6 border-b"
      style={{
        backgroundColor: 'rgba(10, 10, 15, 0.8)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderColor: 'var(--border-subtle, rgba(255,255,255,0.04))',
      }}
    >
      {/* Left: Logo + App Name */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-black text-lg"
          style={{
            background: 'linear-gradient(135deg, #9382ff, #34d399)',
            animation: 'gradient-shift 3s ease infinite',
          }}
        >
          T
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-[var(--text-primary,rgba(255,255,255,0.92))] leading-tight">
            Thesis
          </span>
          <span
            className="text-xs uppercase tracking-widest leading-tight"
            style={{ color: 'var(--text-tertiary, rgba(255,255,255,0.30))' }}
          >
            Macro &rarr; Markets
          </span>
        </div>
      </div>

      {/* Right: Position count + Wallet */}
      <div className="flex items-center gap-4">
        {activePositions > 0 && (
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: 'var(--accent-green, #34d399)',
                boxShadow: '0 0 6px rgba(52, 211, 153, 0.5)',
              }}
            />
            <span
              className="font-mono text-sm"
              style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}
            >
              {activePositions} active
            </span>
          </div>
        )}
        <WalletButton />
      </div>

      <style jsx>{`
        @keyframes gradient-shift {
          0%,
          100% {
            background: linear-gradient(135deg, #9382ff, #34d399);
          }
          50% {
            background: linear-gradient(135deg, #34d399, #9382ff);
          }
        }
      `}</style>
    </header>
  );
}
