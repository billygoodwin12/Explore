'use client';

import React, { useState } from 'react';
import Header from '@/components/layout/Header';
import ChatContainer from '@/components/chat/ChatContainer';
import PortfolioPanel from '@/components/portfolio/PortfolioPanel';
import LandingPage from '@/components/landing/LandingPage';
import { useUIStore } from '@/stores/ui-store';
import { useChatStore } from '@/stores/chat-store';

export default function HomePage() {
  const isPortfolioOpen = useUIStore((s) => s.isPortfolioOpen);
  const togglePortfolio = useUIStore((s) => s.togglePortfolio);
  const messages = useChatStore((s) => s.messages);
  const [started, setStarted] = useState(false);

  const showLanding = !started && messages.length === 0;

  if (showLanding) {
    return <LandingPage onStart={() => setStarted(true)} />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: '#FAFAF8' }}>
      <Header />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Main chat area */}
        <main className="flex-1 overflow-hidden">
          <ChatContainer />
        </main>

        {/* Portfolio slide-out panel */}
        <PortfolioPanel isOpen={isPortfolioOpen} onClose={togglePortfolio} />
      </div>
    </div>
  );
}
