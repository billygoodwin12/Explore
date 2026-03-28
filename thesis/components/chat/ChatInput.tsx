'use client';

import React, { useState, useCallback } from 'react';
import SuggestionChips from './SuggestionChips';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  showSuggestions?: boolean;
}

export default function ChatInput({
  onSend,
  isLoading,
  showSuggestions = false,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const walletWarning = false; // hardcoded for now

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

  const handleSuggestionSelect = (suggestion: string) => {
    onSend(suggestion);
  };

  const hasText = input.trim().length > 0;

  return (
    <div
      className="sticky bottom-0 z-40 border-t px-4 pb-4 pt-3"
      style={{
        backgroundColor: 'rgba(10, 10, 15, 0.90)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderColor: 'var(--border-subtle, rgba(255,255,255,0.04))',
      }}
    >
      {/* Wallet warning */}
      {walletWarning && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3 text-xs"
          style={{
            backgroundColor: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid rgba(251, 191, 36, 0.20)',
            color: 'var(--accent-amber, #fbbf24)',
          }}
        >
          <span>&#9888;</span>
          <span>Connect your wallet to execute trades directly from chat.</span>
        </div>
      )}

      {/* Input container */}
      <div
        className="flex items-center gap-2 rounded-2xl px-2"
        style={{
          backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.02))',
          border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="I think the war in Iran is going to get worse..."
          disabled={isLoading}
          className="flex-1 bg-transparent border-none outline-none text-sm"
          style={{
            padding: '14px 18px',
            color: 'var(--text-primary, rgba(255,255,255,0.92))',
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!hasText || isLoading}
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-200"
          style={{
            background: hasText
              ? 'linear-gradient(135deg, #9382ff, #6d5dd3)'
              : 'var(--bg-surface, rgba(255,255,255,0.02))',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={
              hasText ? '#ffffff' : 'var(--text-tertiary, rgba(255,255,255,0.30))'
            }
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      </div>

      {/* Suggestion chips */}
      {showSuggestions && <SuggestionChips onSelect={handleSuggestionSelect} />}
    </div>
  );
}
