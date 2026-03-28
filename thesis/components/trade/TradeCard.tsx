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

const leverageOptions = [1, 2, 3, 5, 10, 20];

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

  const change24hColor =
    marketData.change24h >= 0
      ? 'var(--accent-green, #34d399)'
      : 'var(--accent-red, #f87171)';

  return (
    <div
      className="rounded-xl transition-all duration-200 overflow-hidden"
      style={{
        backgroundColor: isFilled
          ? 'rgba(52, 211, 153, 0.04)'
          : 'var(--bg-surface, rgba(255,255,255,0.02))',
        border: `1px solid ${
          isFilled
            ? 'rgba(52, 211, 153, 0.20)'
            : 'var(--border-subtle, rgba(255,255,255,0.04))'
        }`,
      }}
    >
      {/* Collapsed View */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => !isFilled && setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Top row: venue, symbol, direction */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <VenueTag venue={recommendation.venue} />
              <span
                className="font-mono text-xs"
                style={{ color: 'var(--text-tertiary, rgba(255,255,255,0.30))' }}
              >
                {recommendation.symbol}
              </span>
              <DirectionBadge direction={recommendation.direction} />
              {isFilled && (
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: 'rgba(52, 211, 153, 0.15)',
                    color: 'var(--accent-green, #34d399)',
                  }}
                >
                  FILLED &#10003;
                </span>
              )}
            </div>

            {/* Instrument name */}
            <h3
              className="text-lg font-semibold mb-1"
              style={{ color: 'var(--text-primary, rgba(255,255,255,0.92))' }}
            >
              {recommendation.name}
            </h3>

            {/* Rationale */}
            <p
              className="text-sm line-clamp-2"
              style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}
            >
              {recommendation.rationale}
            </p>
          </div>

          {/* Right side: price + confidence */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span
              className="text-xl font-bold font-mono"
              style={{ color: 'var(--text-primary, rgba(255,255,255,0.92))' }}
            >
              ${formatPrice(marketData.price)}
            </span>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs" style={{ color: change24hColor }}>
                {marketData.change24h >= 0 ? '+' : ''}
                {marketData.change24h.toFixed(2)}%
              </span>
            </div>
            {marketData.fundingRate !== undefined && isPerp && (
              <span
                className="font-mono text-xs"
                style={{ color: 'var(--text-tertiary, rgba(255,255,255,0.30))' }}
              >
                Funding: {(marketData.fundingRate * 100).toFixed(4)}%
              </span>
            )}
            {!isPerp && (
              <span
                className="font-mono text-xs"
                style={{ color: 'var(--text-tertiary, rgba(255,255,255,0.30))' }}
              >
                Vol: ${(marketData.volume24h / 1000).toFixed(0)}K
              </span>
            )}
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
              className="px-4 pb-4 pt-2 border-t"
              style={{ borderColor: 'var(--border-subtle, rgba(255,255,255,0.04))' }}
            >
              {/* Size Input */}
              <div className="mb-3">
                <label
                  className="text-xs font-medium mb-1.5 block"
                  style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}
                >
                  Size (USDC)
                </label>
                <input
                  type="number"
                  value={sizeUsdc}
                  onChange={(e) => setSizeUsdc(e.target.value)}
                  placeholder="100"
                  className="w-full font-mono text-sm px-3 py-2.5 rounded-lg outline-none transition-colors"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
                    color: 'var(--text-primary, rgba(255,255,255,0.92))',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(147, 130, 255, 0.4)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-default, rgba(255,255,255,0.08))';
                  }}
                />
              </div>

              {/* Leverage Selector (perps only) */}
              {isPerp && (
                <div className="mb-4">
                  <label
                    className="text-xs font-medium mb-1.5 block"
                    style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}
                  >
                    Leverage
                  </label>
                  <div className="flex gap-2">
                    {leverageOptions.map((lev) => (
                      <button
                        key={lev}
                        onClick={() => setLeverage(lev)}
                        className="flex-1 py-1.5 rounded-md text-xs font-bold font-mono transition-all"
                        style={{
                          backgroundColor:
                            leverage === lev
                              ? 'rgba(147, 130, 255, 0.15)'
                              : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${
                            leverage === lev
                              ? 'rgba(147, 130, 255, 0.3)'
                              : 'var(--border-subtle, rgba(255,255,255,0.04))'
                          }`,
                          color:
                            leverage === lev
                              ? 'var(--accent-purple, #9382ff)'
                              : 'var(--text-secondary, rgba(255,255,255,0.55))',
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
          style={{ borderColor: 'rgba(52, 211, 153, 0.10)' }}
        >
          <div className="flex items-center gap-4">
            <span
              className="text-xs font-mono"
              style={{ color: 'var(--text-tertiary, rgba(255,255,255,0.30))' }}
            >
              Fill: ${formatPrice(marketData.price)}
            </span>
            <span
              className="text-xs font-mono"
              style={{ color: 'var(--text-tertiary, rgba(255,255,255,0.30))' }}
            >
              Size: ${sizeUsdc} USDC
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
