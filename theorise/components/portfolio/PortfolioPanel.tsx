'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Position } from '@/lib/venues/types';
import PositionRow from './PositionRow';
import PLChart from './PLChart';

interface PortfolioPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const mockPositions: Position[] = [
  {
    venue: 'hyperliquid',
    symbol: 'ETH-PERP',
    name: 'Ethereum',
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
    name: 'Bitcoin',
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
    symbol: 'FED-CUT',
    name: 'Fed cuts rates by June',
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
          <motion.div
            className="fixed inset-0 z-[60]"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.15)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.aside
            className="fixed top-0 right-0 bottom-0 z-[70] w-[420px] max-w-full overflow-y-auto"
            style={{
              backgroundColor: '#FFFFFF',
              borderLeft: '1px solid rgba(0, 0, 0, 0.08)',
              boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.06)',
            }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div
              className="flex items-center justify-between p-4 border-b"
              style={{ borderColor: 'rgba(0, 0, 0, 0.06)' }}
            >
              <h2 className="text-lg font-semibold" style={{ color: '#1a1a1a' }}>
                Portfolio
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                style={{ backgroundColor: '#F3F3EE', color: '#666666' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-5">
              <div>
                <span className="text-xs font-medium block mb-1" style={{ color: '#999999' }}>
                  Total Value
                </span>
                <span className="text-3xl font-bold font-mono block" style={{ color: '#1a1a1a' }}>
                  ${mockTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="font-mono text-sm" style={{ color: mockChange24h >= 0 ? '#16a34a' : '#dc2626' }}>
                  {mockChange24h >= 0 ? '+' : ''}${mockChange24h.toFixed(2)} ({mockChange24hPercent >= 0 ? '+' : ''}{mockChange24hPercent.toFixed(2)}%) today
                </span>
              </div>

              <PLChart />

              <div>
                <span className="text-xs font-medium mb-2 block" style={{ color: '#666666' }}>
                  Open Positions ({mockPositions.length})
                </span>
                <div className="space-y-2">
                  {mockPositions.map((position) => (
                    <PositionRow key={position.symbol} position={position} />
                  ))}
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
