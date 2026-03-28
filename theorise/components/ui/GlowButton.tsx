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
    background: '#22c55e',
    color: '#ffffff',
  },
  purple: {
    background: '#6B5CE7',
    color: '#ffffff',
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
        font-semibold rounded-lg px-6 py-2.5
        transition-all duration-200 ease-out
        hover:opacity-90 active:scale-[0.98]
        disabled:opacity-40 disabled:cursor-not-allowed
        ${className}
      `}
      style={{
        background: disabled ? '#F3F3EE' : styles.background,
        color: disabled ? '#999999' : styles.color,
      }}
    >
      {children}
    </button>
  );
}
