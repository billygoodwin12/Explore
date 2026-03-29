'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '@/stores/chat-store';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import TypingIndicator from './TypingIndicator';

export default function ChatContainer() {
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const addMessage = useChatStore((s) => s.addMessage);
  const setLoading = useChatStore((s) => s.setLoading);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = useCallback(
    async (content: string) => {
      addMessage({ role: 'user', content });
      setLoading(true);

      try {
        // Build history — send raw JSON for assistant messages so Claude
        // stays in its "always respond with JSON" format
        const history = messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.role === 'assistant' && msg.rawJson
            ? msg.rawJson
            : msg.content,
        }));

        const response = await fetch('/api/thesis/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content, history }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.mode === 'conversation') {
          addMessage({
            role: 'assistant',
            content: data.content,
            rawJson: data.rawJson,
          });
        } else {
          addMessage({
            role: 'assistant',
            content: data.content,
            rawJson: data.rawJson,
            thesis: data.thesis_summary
              ? {
                  thesis_summary: data.thesis_summary,
                  causal_chain: data.causal_chain || [],
                  recommendations: data.recommendations || [],
                }
              : undefined,
            enrichedRecommendations: data.recommendations || undefined,
          });
        }
      } catch (error) {
        console.error('Failed to get response:', error);
        addMessage({
          role: 'assistant',
          content:
            'I encountered an error processing your message. Please try again.',
        });
      } finally {
        setLoading(false);
      }
    },
    [addMessage, setLoading, messages],
  );

  const showEmpty = messages.length === 0 && !isLoading;
  const showSuggestions = messages.length === 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg, #faf9f7)',
      }}
    >
      {showEmpty ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <h2
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: '#1a1917',
              letterSpacing: '-0.03em',
              margin: 0,
            }}
          >
            What&apos;s your theory?
          </h2>
          <p
            style={{
              fontSize: 14,
              color: '#a8a49e',
              maxWidth: 340,
              lineHeight: 1.6,
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            Tell me what you think is going to happen — I&apos;ll find
            investments that match your view.
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 20px 0',
          }}
        >
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {isLoading && <TypingIndicator />}
        </div>
      )}

      <ChatInput
        onSend={handleSend}
        isLoading={isLoading}
        showSuggestions={showSuggestions}
      />
    </div>
  );
}
