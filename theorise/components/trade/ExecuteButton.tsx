'use client';

import React from 'react';

interface ExecuteButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export default function ExecuteButton({
  onClick,
  disabled = false,
  loading = false,
}: ExecuteButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        w-full font-semibold rounded-lg px-6 py-2.5 text-sm
        transition-all duration-200 ease-out
        hover:opacity-90 active:scale-[0.98]
        disabled:opacity-40 disabled:cursor-not-allowed
      `}
      style={{
        background: disabled ? '#F3F3EE' : '#6B5CE7',
        color: disabled ? '#999999' : '#FFFFFF',
      }}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg
            className="animate-spin h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Placing order...
        </span>
      ) : (
        'Invest'
      )}
    </button>
  );
}
