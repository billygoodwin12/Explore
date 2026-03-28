'use client';

import React from 'react';

const pulseKeyframes = `
@keyframes typingPulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
`;

export default function TypingIndicator() {
  return (
    <>
      <style>{pulseKeyframes}</style>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        {/* T icon */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: '#1a1917',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1,
            }}
          >
            T
          </span>
        </div>

        {/* Bubble */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 16,
            background: '#ffffff',
            border: '1px solid #eeedea',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {/* 3 dots */}
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#d5d3cf',
                marginRight: i < 2 ? 4 : 0,
                animation: `typingPulse 1s ease infinite ${i * 0.15}s`,
              }}
            />
          ))}

          {/* Text */}
          <span
            style={{
              fontSize: 12,
              color: '#b5b1ab',
              marginLeft: 6,
            }}
          >
            Mapping your thesis to markets&hellip;
          </span>
        </div>
      </div>
    </>
  );
}
