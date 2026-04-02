'use client';

import { usePathname, useRouter } from 'next/navigation';
import { C, D, M } from '@/styles/tokens';

const TABS = [
  { key: 'trade',  label: 'Trade',  href: '/trade',  enabled: true },
  { key: 'vaults', label: 'Vaults', href: '/vaults', enabled: true },
  { key: 'social', label: 'Social', href: '/social', enabled: false },
] as const;

export default function TabNavigation() {
  const pathname = usePathname();
  const router   = useRouter();

  return (
    <div style={{
      display: 'flex',
      gap: 2,
      background: C.bg,
      borderRadius: 9,
      padding: 3,
      border: `1px solid ${C.borderLight}`,
    }}>
      {TABS.map(({ key, label, href, enabled }) => {
        const active = pathname.startsWith(href);
        return (
          <button
            key={key}
            onClick={() => enabled && router.push(href)}
            style={{
              padding: '6px 20px',
              borderRadius: 7,
              border: 'none',
              cursor: enabled ? 'pointer' : 'default',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: D,
              position: 'relative',
              background: active ? C.card : 'transparent',
              color: !enabled ? C.border : active ? C.primary : C.secondary,
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
              opacity: !enabled ? 0.5 : 1,
              transition: 'all 0.1s',
            }}
          >
            {label}
            {!enabled && (
              <span style={{
                position: 'absolute', top: -5, right: 0,
                fontSize: 7, fontWeight: 700, color: C.muted, fontFamily: M,
              }}>
                SOON
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
