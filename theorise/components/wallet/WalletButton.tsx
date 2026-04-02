'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { C, M } from '@/styles/tokens';

export default function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;
        return (
          <button
            onClick={connected ? openAccountModal : openConnectModal}
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
              background: connected ? C.greenBg : C.primary,
              color: connected ? C.green : 'white',
              border: connected ? '1px solid #B2E5CC' : `1px solid ${C.primary}`,
              transition: 'all 0.15s',
            }}
          >
            {connected && (
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: C.green,
                boxShadow: `0 0 6px ${C.green}44`,
              }} />
            )}
            {connected ? account.displayName : 'Connect Wallet'}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
