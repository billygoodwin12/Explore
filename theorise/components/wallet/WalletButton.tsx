'use client';

import { useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { C, M } from '@/styles/tokens';

export default function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [showMenu, setShowMenu] = useState(false);

  const displayAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : '';

  if (isConnected) {
    return (
      <button
        onClick={() => disconnect()}
        style={{
          padding: '7px 16px',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 700,
          fontFamily: M,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          background: C.greenBg,
          color: C.green,
          border: '1px solid #B2E5CC',
          transition: 'all 0.15s',
        }}
      >
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: C.green,
          boxShadow: `0 0 6px ${C.green}44`,
        }} />
        {displayAddress}
      </button>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={isPending}
        style={{
          padding: '7px 16px',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 700,
          fontFamily: M,
          background: C.primary,
          color: 'white',
          border: `1px solid ${C.primary}`,
          transition: 'all 0.15s',
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? 'Connecting...' : 'Connect Wallet'}
      </button>

      {showMenu && (
        <>
          <div
            onClick={() => setShowMenu(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          />
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 8,
            minWidth: 200,
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}>
            <div style={{
              fontSize: 11,
              fontFamily: M,
              color: C.secondary,
              padding: '4px 8px 8px',
              borderBottom: `1px solid ${C.borderLight}`,
              marginBottom: 4,
            }}>
              Select a wallet
            </div>
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => {
                  connect({ connector });
                  setShowMenu(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: M,
                  fontWeight: 500,
                  color: C.primary,
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.bg)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {connector.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
