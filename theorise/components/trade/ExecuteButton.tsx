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
        w-full font-extrabold rounded-lg px-6 py-3 text-sm
        transition-all duration-200 ease-out
        hover:scale-[1.03] active:scale-[0.98]
        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
      `}
      style={{
        background: disabled ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #34d399, #059669)',
        color: disabled ? 'rgba(255,255,255,0.3)' : '#000000',
        boxShadow: disabled ? 'none' : '0 0 20px rgba(52, 211, 153, 0.3)',
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.boxShadow = '0 0 30px rgba(52, 211, 153, 0.5)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.boxShadow = '0 0 20px rgba(52, 211, 153, 0.3)';
        }
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
          Executing...
        </span>
      ) : (
        'Execute Trade'
      )}
    </button>
  );
}
