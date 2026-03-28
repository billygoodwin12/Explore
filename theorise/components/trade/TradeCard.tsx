'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Recommendation, MarketData } from '@/lib/venues/types';
import VenueTag from './VenueTag';
import DirectionBadge from './DirectionBadge';
import ConfidenceBar from './ConfidenceBar';
import ExecuteButton from './ExecuteButton';

interface TradeCardProps {
  recommendation: Recommendation;
  marketData: MarketData;
  onExecute?: (params: { sizeUsdc: number; leverage: number }) => void;
  status?: 'idle' | 'executing' | 'filled';
}

const leverageOptions = [1, 2, 3, 5, 10];

export default function TradeCard({
  recommendation,
  marketData,
  onExecute,
  status = 'idle',
}: TradeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [sizeUsdc, setSizeUsdc] = useState('100');
  const [leverage, setLeverage] = useState(1);

  const isFilled = status === 'filled';
  const isExecuting = status === 'executing';
  const isPerp = recommendation.instrument_type === 'perp';

  const handleExecute = () => {
    onExecute?.({ sizeUsdc: parseFloat(sizeUsdc) || 0, leverage });
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(4);
  };

  const change24hColor = marketData.change24h >= 0 ? '#16a34a' : '#dc2626';

  return (
    <div
      className="rounded-xl transition-all duration-200 overflow-hidden"
      style={{
        backgroundColor: isFilled ? 'rgba(34, 197, 94, 0.04)' : '#FFFFFF',
        border: `1px solid ${
          isFilled ? 'rgba(34, 197, 94, 0.20)' : 'rgba(0, 0, 0, 0.08)'
        }`,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Collapsed View */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => !isFilled && setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Top row: venue + direction */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <VenueTag venue={recommendation.venue} />
              <DirectionBadge direction={recommendation.direction} />
              {isFilled && (
                <span
                  className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.08)',
                    color: '#16a34a',
                  }}
                >
                  Filled ✓
                </span>
              )}
            </div>

            {/* Instrument name */}
            <h3
              className="font-semibold mb-1"
              style={{ fontSize: '15px', color: '#1a1a1a' }}
            >
              {recommendation.name}
            </h3>

            {/* Rationale */}
            <p
              className="text-sm line-clamp-2"
              style={{ color: '#666666', lineHeight: 1.5 }}
            >
              {recommendation.rationale}
            </p>
          </div>

          {/* Right side: price + confidence */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span
              className="text-lg font-bold font-mono"
              style={{ color: '#1a1a1a' }}
            >
              ${formatPrice(marketData.price)}
            </span>
            <span className="font-mono text-xs" style={{ color: change24hColor }}>
              {marketData.change24h >= 0 ? '+' : ''}
              {marketData.change24h.toFixed(2)}%
            </span>
            <ConfidenceBar confidence={recommendation.conviction} />
          </div>
        </div>
      </div>

      {/* Expanded View */}
      <AnimatePresence>
        {expanded && !isFilled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 pt-3 border-t"
              style={{ borderColor: 'rgba(0, 0, 0, 0.06)' }}
            >
              {/* Size Input */}
              <div className="mb-3">
                <label
                  className="text-xs font-medium mb-1.5 block"
                  style={{ color: '#666666' }}
                >
                  Amount (USD)
                </label>
                <input
                  type="number"
                  value={sizeUsdc}
                  onChange={(e) => setSizeUsdc(e.target.value)}
                  placeholder="100"
                  className="w-full font-mono text-sm px-3 py-2.5 rounded-lg outline-none transition-colors"
                  style={{
                    backgroundColor: '#F3F3EE',
                    border: '1px solid rgba(0, 0, 0, 0.08)',
                    color: '#1a1a1a',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(107, 92, 231, 0.4)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.08)';
                  }}
                />
              </div>

              {/* Leverage Selector (futures only) */}
              {isPerp && (
                <div className="mb-4">
                  <label
                    className="text-xs font-medium mb-1.5 block"
                    style={{ color: '#666666' }}
                  >
                    Multiplier
                  </label>
                  <div className="flex gap-2">
                    {leverageOptions.map((lev) => (
                      <button
                        key={lev}
                        onClick={() => setLeverage(lev)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          backgroundColor:
                            leverage === lev
                              ? 'rgba(107, 92, 231, 0.08)'
                              : '#F3F3EE',
                          border: `1px solid ${
                            leverage === lev
                              ? 'rgba(107, 92, 231, 0.25)'
                              : 'rgba(0, 0, 0, 0.06)'
                          }`,
                          color:
                            leverage === lev ? '#6B5CE7' : '#666666',
                        }}
                      >
                        {lev}x
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <ExecuteButton
                onClick={handleExecute}
                disabled={!sizeUsdc || parseFloat(sizeUsdc) <= 0}
                loading={isExecuting}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filled details */}
      {isFilled && (
        <div
          className="px-4 pb-4 pt-2 border-t"
          style={{ borderColor: 'rgba(34, 197, 94, 0.10)' }}
        >
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono" style={{ color: '#999999' }}>
              Filled at ${formatPrice(marketData.price)}
            </span>
            <span className="text-xs font-mono" style={{ color: '#999999' }}>
              ${sizeUsdc} USD
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
