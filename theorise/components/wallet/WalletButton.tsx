'use client';

import React, { useState } from 'react';

export default function WalletButton() {
  const [connected, setConnected] = useState(false);

  return (
    <button
      onClick={() => setConnected(!connected)}
      className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200"
      style={{
        backgroundColor: connected ? 'rgba(34, 197, 94, 0.06)' : 'transparent',
        border: `1px solid ${
          connected
            ? 'rgba(34, 197, 94, 0.20)'
            : 'rgba(0, 0, 0, 0.12)'
        }`,
        color: connected ? '#16a34a' : '#666666',
      }}
    >
      {connected ? (
        <>
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: '#22c55e' }}
          />
          <span className="font-mono text-sm">0x7a3F...c92E</span>
        </>
      ) : (
        <>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#666666"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
          </svg>
          <span>Connect Wallet</span>
        </>
      )}
    </button>
  );
}
