import React from 'react';

interface ConfidenceBarProps {
  confidence: number;
}

export default function ConfidenceBar({ confidence }: ConfidenceBarProps) {
  const v = Math.max(0, Math.min(100, confidence));
  const color = v > 80 ? '#22c55e' : v > 65 ? '#f59e0b' : '#ef4444';
  const textColor = v > 80 ? '#16a34a' : v > 65 ? '#d97706' : '#dc2626';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 44, height: 3, background: '#f0eeeb', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          width: `${v}%`, height: '100%', borderRadius: 2,
          background: color,
          transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
        }} />
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700,
        fontFamily: 'var(--mono)',
        color: textColor,
      }}>{v}%</span>
    </div>
  );
}
