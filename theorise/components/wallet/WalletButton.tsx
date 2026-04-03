'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { C, M } from '@/styles/tokens';

export default function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();

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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {error && (
        <span style={{ fontSize: 10, fontFamily: M, color: C.red, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {error.message.slice(0, 40)}
        </span>
      )}
      <button
        onClick={() => {
          // Use the first available connector (injected = MetaMask/browser wallet)
          const connector = connectors[0];
          if (connector) connect({ connector });
        }}
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
    </div>
  );
}
