'use client';

import { C, D, M } from '@/styles/tokens';
import TabNavigation from './TabNavigation';
import WalletButton from '@/components/wallet/WalletButton';
import { NETWORK } from '@/lib/wallet/networks';

export default function Header() {
  return (
    <div style={{
      padding: '0 20px',
      height: 52,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: `1px solid ${C.border}`,
      background: C.card,
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: C.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: 'white', fontFamily: D,
        }}>T</div>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.primary, fontFamily: D, letterSpacing: '-0.02em' }}>
          Theorise
        </span>
        {NETWORK === 'testnet' && (
          <span style={{
            marginLeft: 4,
            fontSize: 9, fontWeight: 700, fontFamily: M,
            padding: '3px 7px', borderRadius: 4,
            background: '#FDF6E8', color: '#7A6010',
            border: '1px solid #F59E0B',
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            Testnet
          </span>
        )}
      </div>

      {/* Tabs */}
      <TabNavigation />

      {/* Wallet */}
      <WalletButton />
    </div>
  );
}
