'use client';

import React, { useState } from 'react';

export default function WalletButton() {
  const [connected, setConnected] = useState(false);

  return (
    <button
      onClick={() => setConnected(!connected)}
      className="flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
      style={{
        backgroundColor: connected ? 'rgba(52, 211, 153, 0.08)' : 'transparent',
        border: `1px solid ${
          connected
            ? 'rgba(52, 211, 153, 0.25)'
            : 'var(--border-default, rgba(255,255,255,0.08))'
        }`,
        color: connected
          ? 'var(--accent-green, #34d399)'
          : 'var(--text-secondary, rgba(255,255,255,0.55))',
      }}
    >
      <div
        className="w-2 h-2 rounded-full"
        style={{
          backgroundColor: connected ? 'var(--accent-green, #34d399)' : 'rgba(255,255,255,0.20)',
          boxShadow: connected ? '0 0 8px rgba(52, 211, 153, 0.6)' : 'none',
        }}
      />
      {connected ? (
        <span className="font-mono">0x7a3F...c92E</span>
      ) : (
        <span>Connect Wallet</span>
      )}
    </button>
  );
}
