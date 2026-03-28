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
      className="sticky bottom-0 z-40 px-4 pb-4 pt-3"
      style={{
        backgroundColor: '#FFFFFF',
        boxShadow: '0 -1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Input container */}
      <div
        className="flex items-center gap-2 rounded-2xl px-2"
        style={{
          backgroundColor: '#F3F3EE',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What's on your mind about the markets?"
          disabled={isLoading}
          className="flex-1 bg-transparent border-none outline-none text-sm"
          style={{
            padding: '14px 16px',
            color: '#1a1a1a',
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!hasText || isLoading}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-200"
          style={{
            backgroundColor: hasText ? '#6B5CE7' : 'rgba(0, 0, 0, 0.06)',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={hasText ? '#ffffff' : '#cccccc'}
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
