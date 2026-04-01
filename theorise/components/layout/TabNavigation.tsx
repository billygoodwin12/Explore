'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';

const tabs = [
  { label: 'Trade', href: '/trade', enabled: true },
  { label: 'Vaults', href: '/vaults', enabled: true },
  { label: 'Social', href: '/social', enabled: false },
] as const;

export default function TabNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        padding: 3,
      }}
    >
      {tabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        const isDisabled = !tab.enabled;

        return (
          <button
            key={tab.href}
            onClick={() => !isDisabled && router.push(tab.href)}
            disabled={isDisabled}
            style={{
              position: 'relative',
              padding: '7px 20px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'var(--font-display)',
              letterSpacing: '-0.01em',
              cursor: isDisabled ? 'default' : 'pointer',
              transition: 'all 0.15s ease',
              background: isActive ? 'var(--bg-card)' : 'transparent',
              color: isDisabled
                ? 'var(--text-muted)'
                : isActive
                  ? 'var(--text-primary)'
                  : 'var(--text-tertiary)',
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              opacity: isDisabled ? 0.5 : 1,
            }}
          >
            {tab.label}
            {isDisabled && (
              <span
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -4,
                  fontSize: 8,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  background: 'var(--bg-surface)',
                  padding: '1px 4px',
                  borderRadius: 'var(--radius-sm)',
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                }}
              >
                Soon
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
