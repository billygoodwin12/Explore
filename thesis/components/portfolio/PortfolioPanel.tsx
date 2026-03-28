'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Position } from '@/lib/venues/types';
import PositionRow from './PositionRow';
import PLChart from './PLChart';
import FundingTracker from './FundingTracker';

interface PortfolioPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const mockPositions: Position[] = [
  {
    venue: 'hyperliquid',
    symbol: 'ETH-PERP',
    name: 'Ethereum Perpetual',
    direction: 'LONG',
    size: 500,
    entryPrice: 3245.5,
    currentPrice: 3312.8,
    unrealizedPnl: 67.3,
    unrealizedPnlPercent: 2.07,
    leverage: 5,
  },
  {
    venue: 'hyperliquid',
    symbol: 'BTC-PERP',
    name: 'Bitcoin Perpetual',
    direction: 'SHORT',
    size: 1000,
    entryPrice: 67450.0,
    currentPrice: 66890.0,
    unrealizedPnl: 56.0,
    unrealizedPnlPercent: 0.83,
    leverage: 3,
  },
  {
    venue: 'polymarket',
    symbol: 'IRAN-ESC',
    name: 'Iran Escalation > 50%',
    direction: 'BUY_YES',
    size: 250,
    entryPrice: 0.62,
    currentPrice: 0.68,
    unrealizedPnl: 24.19,
    unrealizedPnlPercent: 9.68,
    leverage: 1,
  },
];

const mockTotalValue = 12847.32;
const mockChange24h = 147.49;
const mockChange24hPercent = 1.16;

export default function PortfolioPanel({ isOpen, onClose }: PortfolioPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-[60]"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.50)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.aside
            className="fixed top-0 right-0 bottom-0 z-[70] w-[420px] max-w-full overflow-y-auto"
            style={{
              backgroundColor: 'var(--bg-secondary, #0f0f17)',
              borderLeft: '1px solid var(--border-default, rgba(255,255,255,0.08))',
            }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between p-4 border-b"
              style={{
                borderColor: 'var(--border-subtle, rgba(255,255,255,0.04))',
              }}
            >
              <h2
                className="text-lg font-bold"
                style={{
                  color: 'var(--text-primary, rgba(255,255,255,0.92))',
                }}
              >
                Portfolio
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  color: 'var(--text-secondary, rgba(255,255,255,0.55))',
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Total Value */}
              <div>
                <span
                  className="text-xs font-medium block mb-1"
                  style={{
                    color: 'var(--text-tertiary, rgba(255,255,255,0.30))',
                  }}
                >
                  Total Value
                </span>
                <span
                  className="text-3xl font-bold font-mono block"
                  style={{
                    color: 'var(--text-primary, rgba(255,255,255,0.92))',
                  }}
                >
                  ${mockTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span
                  className="font-mono text-sm"
                  style={{
                    color:
                      mockChange24h >= 0
                        ? 'var(--accent-green, #34d399)'
                        : 'var(--accent-red, #f87171)',
                  }}
                >
                  {mockChange24h >= 0 ? '+' : ''}
                  ${mockChange24h.toFixed(2)} ({mockChange24hPercent >= 0 ? '+' : ''}
                  {mockChange24hPercent.toFixed(2)}%) 24h
                </span>
              </div>

              {/* P&L Chart */}
              <PLChart />

              {/* Positions */}
              <div>
                <span
                  className="text-xs font-medium mb-2 block"
                  style={{
                    color: 'var(--text-secondary, rgba(255,255,255,0.55))',
                  }}
                >
                  Open Positions ({mockPositions.length})
                </span>
                <div className="space-y-2">
                  {mockPositions.map((position) => (
                    <PositionRow key={position.symbol} position={position} />
                  ))}
                </div>
              </div>

              {/* Funding Tracker */}
              <FundingTracker />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
