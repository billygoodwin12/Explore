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

  // Auto-scroll to bottom on new messages or loading state change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = useCallback(
    async (content: string) => {
      // Add user message
      addMessage({ role: 'user', content });
      setLoading(true);

      try {
        // Build conversation history from store messages
        const history = messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
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
          // Pure conversational response — no trade cards
          addMessage({
            role: 'assistant',
            content: data.content,
          });
        } else {
          // Trade recommendation response
          addMessage({
            role: 'assistant',
            content: data.content,
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

  const showSuggestions = messages.length === 0;

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: '#FAFAF8' }}
    >
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full px-4">
            {/* Brand icon */}
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-5"
              style={{ backgroundColor: 'rgba(107, 92, 231, 0.10)' }}
            >
              <span
                className="font-bold"
                style={{ color: '#6B5CE7', fontSize: '18px' }}
              >
                T
              </span>
            </div>

            <h2
              className="text-lg font-semibold mb-2"
              style={{ color: '#1a1a1a' }}
            >
              What&apos;s on your mind?
            </h2>
            <p
              className="text-sm text-center max-w-md"
              style={{ color: '#666666', lineHeight: 1.6 }}
            >
              Share a thought about the world and I&apos;ll help you find
              investment opportunities.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {isLoading && <TypingIndicator />}
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        isLoading={isLoading}
        showSuggestions={showSuggestions}
      />
    </div>
  );
}
