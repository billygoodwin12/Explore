'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { EnrichedRecommendation } from '@/lib/venues/types';
import TradeCard from './TradeCard';

interface TradeSelection {
  sizeUsdc: string;
  leverage: number;
}

interface TradeCardListProps {
  recommendations: EnrichedRecommendation[];
  onInvest?: (
    selections: Array<{
      recommendation: EnrichedRecommendation;
      sizeUsdc: number;
      leverage: number;
    }>,
  ) => void;
}

export default function TradeCardList({
  recommendations,
  onInvest,
}: TradeCardListProps) {
  // Track which cards are selected and their parameters
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [params, setParams] = useState<Record<number, TradeSelection>>(() => {
    const initial: Record<number, TradeSelection> = {};
    recommendations.forEach((_, i) => {
      initial[i] = { sizeUsdc: '100', leverage: 1 };
    });
    return initial;
  });

  const toggleCard = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const updateSize = useCallback((index: number, size: string) => {
    setParams((prev) => ({
      ...prev,
      [index]: { ...prev[index], sizeUsdc: size },
    }));
  }, []);

  const updateLeverage = useCallback((index: number, leverage: number) => {
    setParams((prev) => ({
      ...prev,
      [index]: { ...prev[index], leverage },
    }));
  }, []);

  const handleInvest = () => {
    const selections = Array.from(selected)
      .map((index) => ({
        recommendation: recommendations[index],
        sizeUsdc: parseFloat(params[index]?.sizeUsdc || '0') || 0,
        leverage: params[index]?.leverage || 1,
      }))
      .filter((s) => s.sizeUsdc > 0);

    if (selections.length > 0) {
      onInvest?.(selections);
    }
  };

  const selectedCount = selected.size;
  const totalAmount = Array.from(selected).reduce((sum, index) => {
    return sum + (parseFloat(params[index]?.sizeUsdc || '0') || 0);
  }, 0);

  return (
    <div className="flex flex-col gap-2 mt-3">
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
            selected={selected.has(index)}
            onToggle={() => toggleCard(index)}
            sizeUsdc={params[index]?.sizeUsdc || '100'}
            onSizeChange={(size) => updateSize(index, size)}
            leverage={params[index]?.leverage || 1}
            onLeverageChange={(lev) => updateLeverage(index, lev)}
          />
        </motion.div>
      ))}

      {/* Batch Invest button */}
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-2"
        >
          <button
            onClick={handleInvest}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.99]"
            style={{
              backgroundColor: '#6B5CE7',
              color: '#FFFFFF',
            }}
          >
            Invest in {selectedCount} {selectedCount === 1 ? 'position' : 'positions'}
            {totalAmount > 0 && (
              <span style={{ opacity: 0.7 }}> &middot; ${totalAmount.toLocaleString()}</span>
            )}
          </button>
        </motion.div>
      )}
    </div>
  );
}
