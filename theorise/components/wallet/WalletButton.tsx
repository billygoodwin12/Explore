'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { C, M } from '@/styles/tokens';

export default function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
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
    <button
      onClick={() => {
        const connector = connectors[0];
        if (connector) connect({ connector });
      }}
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
      }}
    >
      Connect Wallet
    </button>
  );
}
