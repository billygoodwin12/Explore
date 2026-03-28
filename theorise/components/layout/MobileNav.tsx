'use client';

import React, { useState } from 'react';

type Tab = 'chat' | 'portfolio';

interface MobileNavProps {
  activeTab?: Tab;
  onTabChange?: (tab: Tab) => void;
}

export default function MobileNav({ activeTab: controlledTab, onTabChange }: MobileNavProps) {
  const [internalTab, setInternalTab] = useState<Tab>('chat');
  const activeTab = controlledTab ?? internalTab;

  const handleTabChange = (tab: Tab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t"
      style={{
        height: '60px',
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(0, 0, 0, 0.08)',
      }}
    >
      {/* Chat Tab */}
      <button
        onClick={() => handleTabChange('chat')}
        className="flex flex-col items-center gap-1 px-6 py-2 transition-colors"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke={activeTab === 'chat' ? '#6B5CE7' : '#999999'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span
          className="text-xs font-medium"
          style={{
            color: activeTab === 'chat' ? '#6B5CE7' : '#999999',
          }}
        >
          Chat
        </span>
      </button>

      {/* Portfolio Tab */}
      <button
        onClick={() => handleTabChange('portfolio')}
        className="flex flex-col items-center gap-1 px-6 py-2 transition-colors"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke={activeTab === 'portfolio' ? '#6B5CE7' : '#999999'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 20V10" />
          <path d="M12 20V4" />
          <path d="M6 20v-6" />
        </svg>
        <span
          className="text-xs font-medium"
          style={{
            color: activeTab === 'portfolio' ? '#6B5CE7' : '#999999',
          }}
        >
          Portfolio
        </span>
      </button>
    </nav>
  );
}
