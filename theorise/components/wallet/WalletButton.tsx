'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <button
            onClick={connected ? openAccountModal : openConnectModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              background: connected ? 'var(--bg-surface)' : 'var(--text-primary)',
              color: connected ? 'var(--text-primary)' : 'var(--text-inverse)',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'var(--font-display)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              letterSpacing: '-0.01em',
            }}
          >
            {connected ? (
              <>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'var(--green)',
                  }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {account.displayName}
                </span>
              </>
            ) : (
              'Connect Wallet'
            )}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
