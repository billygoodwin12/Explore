'use client';

import React from 'react';
import { motion } from 'framer-motion';

export default function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-2">
      {/* Branded icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background: 'linear-gradient(135deg, #14141f, #1a1a2e)',
          border: '1px solid rgba(147, 130, 255, 0.15)',
        }}
      >
        <span style={{ color: 'var(--accent-purple, #9382ff)', fontSize: '14px' }}>
          &#9670;
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {/* Dots */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="rounded-full"
              style={{
                width: '6px',
                height: '6px',
                backgroundColor: 'var(--accent-purple, #9382ff)',
              }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>

        {/* Text */}
        <span
          className="text-sm italic"
          style={{ color: 'var(--text-tertiary, rgba(255,255,255,0.30))' }}
        >
          Mapping thesis to markets...
        </span>
      </div>
    </div>
  );
}
