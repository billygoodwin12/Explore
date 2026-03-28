'use client';

import React from 'react';

interface GlowButtonProps {
  variant: 'green' | 'purple';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

const variantStyles = {
  green: {
    background: 'linear-gradient(135deg, #34d399, #059669)',
    color: '#000000',
    shadow: '0 0 20px rgba(52, 211, 153, 0.3)',
    shadowHover: '0 0 30px rgba(52, 211, 153, 0.5)',
  },
  purple: {
    background: 'linear-gradient(135deg, #9382ff, #6d5dd3)',
    color: '#ffffff',
    shadow: '0 0 20px rgba(147, 130, 255, 0.3)',
    shadowHover: '0 0 30px rgba(147, 130, 255, 0.5)',
  },
} as const;

export default function GlowButton({
  variant,
  children,
  onClick,
  disabled = false,
  className = '',
}: GlowButtonProps) {
  const styles = variantStyles[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        font-extrabold rounded-lg px-6 py-3
        transition-all duration-200 ease-out
        hover:scale-[1.03] active:scale-[0.98]
        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
        ${className}
      `}
      style={{
        background: disabled ? 'rgba(255,255,255,0.1)' : styles.background,
        color: disabled ? 'rgba(255,255,255,0.3)' : styles.color,
        boxShadow: disabled ? 'none' : styles.shadow,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.boxShadow = styles.shadowHover;
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.boxShadow = styles.shadow;
        }
      }}
    >
      {children}
    </button>
  );
}
