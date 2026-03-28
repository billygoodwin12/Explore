'use client';

import React from 'react';

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void;
}

const suggestions = [
  'What if oil prices spike?',
  'AI is changing everything',
  'Will the Fed cut rates?',
  'Is crypto going up?',
  'Recession worries',
  'China-Taiwan tensions',
];

export default function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSelect(suggestion)}
          className="text-sm rounded-full transition-all duration-200"
          style={{
            padding: '6px 14px',
            backgroundColor: '#F3F3EE',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            color: '#666666',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(107, 92, 231, 0.35)';
            e.currentTarget.style.color = '#1a1a1a';
            e.currentTarget.style.backgroundColor = '#F7F7F5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.06)';
            e.currentTarget.style.color = '#666666';
            e.currentTarget.style.backgroundColor = '#F3F3EE';
          }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
