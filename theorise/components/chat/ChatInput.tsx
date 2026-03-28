'use client';

import React, { useState, useRef, useCallback } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  showSuggestions?: boolean;
  showWalletWarning?: boolean;
}

const suggestions = [
  'I think consumers will spend less',
  'The Iran situation will escalate',
  'AI is the next big bubble',
  'A recession is coming',
];

export default function ChatInput({
  onSend,
  isLoading,
  showSuggestions = false,
  showWalletWarning = false,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setInput('');
  }, [input, isLoading, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasText = input.trim().length > 0;
  const isActive = hasText && !isLoading;

  return (
    <div
      style={{
        padding: '12px 20px 20px',
        borderTop: '1px solid #eeedea',
        background: '#ffffff',
        flexShrink: 0,
      }}
    >
      {/* Wallet warning */}
      {showWalletWarning && !showSuggestions && (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 12px',
            borderRadius: 8,
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            fontSize: 12,
            color: '#b45309',
          }}
        >
          &#x26A0; Connect your wallet to execute trades. You can still explore
          recommendations.
        </div>
      )}

      {/* Input row */}
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Input container */}
        <div
          style={{
            flex: 1,
            background: '#f7f6f3',
            border: '1px solid #eeedea',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What is your theory?"
            disabled={isLoading}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              padding: '12px 14px',
              color: '#1a1917',
              fontSize: 14,
              fontFamily: 'var(--display)',
            }}
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!isActive}
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            border: 'none',
            cursor: isActive ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            background: isActive ? '#1a1917' : '#f3f2ef',
            color: isActive ? '#ffffff' : '#ccc9c3',
            flexShrink: 0,
          }}
        >
          &#x2191;
        </button>
      </div>

      {/* Suggestions */}
      {showSuggestions && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => {
                setInput(suggestion);
                inputRef.current?.focus();
              }}
              style={{
                background: '#ffffff',
                border: '1px solid #eeedea',
                borderRadius: 8,
                padding: '7px 12px',
                fontSize: 12,
                color: '#8a8680',
                fontFamily: 'var(--display)',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#d5d3cf';
                e.currentTarget.style.color = '#5c5955';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#eeedea';
                e.currentTarget.style.color = '#8a8680';
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
