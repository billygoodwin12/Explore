'use client';

import { C, D } from '@/styles/tokens';
import TabNavigation from './TabNavigation';
import WalletButton from '@/components/wallet/WalletButton';

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
      </div>

      {/* Tabs */}
      <TabNavigation />

      {/* Wallet */}
      <WalletButton />
    </div>
  );
}
