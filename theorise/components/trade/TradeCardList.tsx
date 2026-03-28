'use client';

import React from 'react';
import { motion } from 'framer-motion';
import type { EnrichedRecommendation } from '@/lib/venues/types';
import TradeCard from './TradeCard';

interface TradeCardListProps {
  recommendations: EnrichedRecommendation[];
  onExecute?: (
    recommendation: EnrichedRecommendation,
    params: { sizeUsdc: number; leverage: number },
  ) => void;
}

export default function TradeCardList({
  recommendations,
  onExecute,
}: TradeCardListProps) {
  return (
    <div className="flex flex-col gap-3">
      {recommendations.map((rec, index) => (
        <motion.div
          key={`${rec.venue}-${rec.symbol}-${index}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.35,
            delay: index * 0.12,
            ease: 'easeOut',
          }}
        >
          <TradeCard
            recommendation={rec}
            marketData={rec.marketData}
            onExecute={(params) => onExecute?.(rec, params)}
          />
        </motion.div>
      ))}
    </div>
  );
}
