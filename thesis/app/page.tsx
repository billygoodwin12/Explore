'use client';

import React from 'react';
import Header from '@/components/layout/Header';
import VenueStatusBar from '@/components/layout/VenueStatusBar';
import ChatContainer from '@/components/chat/ChatContainer';
import PortfolioPanel from '@/components/portfolio/PortfolioPanel';
import { useUIStore } from '@/stores/ui-store';
import { usePortfolioStore } from '@/stores/portfolio-store';

export default function HomePage() {
  const isPortfolioOpen = useUIStore((s) => s.isPortfolioOpen);
  const togglePortfolio = useUIStore((s) => s.togglePortfolio);
  const positions = usePortfolioStore((s) => s.positions);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header activePositions={positions.length} />
      <VenueStatusBar />

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
