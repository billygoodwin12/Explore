'use client';

import React, { useState } from 'react';

type Tab = 'chat' | 'portfolio' | 'vault';

interface MobileNavProps {
  activeTab?: Tab;
  onTabChange?: (tab: Tab) => void;
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'portfolio', label: 'Portfolio', icon: '📊' },
  { id: 'vault', label: 'Vault', icon: '🏦' },
];

export default function MobileNav({ activeTab: controlledTab, onTabChange }: MobileNavProps) {
  const [internalTab, setInternalTab] = useState<Tab>('chat');
  const activeTab = controlledTab ?? internalTab;

  const handleTabChange = (tab: Tab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 flex items-center justify-around border-t"
      style={{
        backgroundColor: 'rgba(10, 10, 15, 0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderColor: 'var(--border-subtle, rgba(255,255,255,0.04))',
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className="flex flex-col items-center gap-1 px-4 py-2 transition-colors"
          >
            <span className="text-lg">{tab.icon}</span>
            <span
              className="text-xs font-medium"
              style={{
                color: isActive
                  ? 'var(--accent-purple, #9382ff)'
                  : 'var(--text-tertiary, rgba(255,255,255,0.30))',
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
