'use client';

import React, { useState } from 'react';
import Header from '@/components/layout/Header';
import ChatContainer from '@/components/chat/ChatContainer';
import LandingPage from '@/components/landing/LandingPage';
import { useChatStore } from '@/stores/chat-store';

export default function HomePage() {
  const messages = useChatStore((s) => s.messages);
  const [started, setStarted] = useState(false);

  const showLanding = !started && messages.length === 0;

  if (showLanding) {
    return <LandingPage onStart={() => setStarted(true)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      <Header />
      <div style={{ flex: 1, overflow: 'hidden', padding: '0 384px' }}>
        <ChatContainer />
      </div>
    </div>
  );
}
