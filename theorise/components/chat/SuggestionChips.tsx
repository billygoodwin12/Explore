import React from 'react';

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void;
}

const suggestions = [
  'Iran escalation',
  'AI infrastructure boom',
  'Fed holds rates',
  'Crypto bull run',
  'Recession incoming',
  'China Taiwan tensions',
];

export default function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSelect(suggestion)}
          className="font-mono text-xs rounded-lg transition-all duration-200"
          style={{
            padding: '5px 12px',
            backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.02))',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
            color: 'var(--text-tertiary, rgba(255,255,255,0.30))',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(147, 130, 255, 0.4)';
            e.currentTarget.style.color = 'var(--text-secondary, rgba(255,255,255,0.55))';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-subtle, rgba(255,255,255,0.04))';
            e.currentTarget.style.color = 'var(--text-tertiary, rgba(255,255,255,0.30))';
          }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
