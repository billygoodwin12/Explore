'use client';

import React from 'react';
import { motion } from 'framer-motion';

export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Dots */}
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="rounded-full"
            style={{
              width: '6px',
              height: '6px',
              backgroundColor: '#6B5CE7',
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
        className="text-sm"
        style={{ color: '#999999' }}
      >
        Thinking...
      </span>
    </div>
  );
}
