'use client';

import React from 'react';
import PortfolioPanel from '@/components/portfolio/PortfolioPanel';
import PLChart from '@/components/portfolio/PLChart';
import PositionRow from '@/components/portfolio/PositionRow';
import { usePortfolio } from '@/hooks/usePortfolio';

export default function PortfolioPage() {
  const { positions, totalValue, totalPnl, isLoading } = usePortfolio();

  return (
    <div
      className="min-h-screen p-6 md:p-10"
      style={{ backgroundColor: 'var(--bg-primary, #0a0a0f)' }}
    >
      <h1
        className="text-2xl font-bold mb-6"
        style={{ color: 'var(--text-primary, rgba(255,255,255,0.92))' }}
      >
        Portfolio Dashboard
      </h1>

      {isLoading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading portfolio...</p>
      ) : (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            <div
              className="rounded-xl p-4"
              style={{ backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.02))' }}
            >
              <span
                className="text-xs uppercase tracking-wider font-mono"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Total Value
              </span>
              <p className="text-xl font-bold font-mono mt-1">
                ${totalValue.toLocaleString()}
              </p>
            </div>

            <div
              className="rounded-xl p-4"
              style={{ backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.02))' }}
            >
              <span
                className="text-xs uppercase tracking-wider font-mono"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Total P&amp;L
              </span>
              <p
                className="text-xl font-bold font-mono mt-1"
                style={{
                  color:
                    totalPnl >= 0
                      ? 'var(--accent-green, #34d399)'
                      : 'var(--accent-red, #f87171)',
                }}
              >
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString()}
              </p>
            </div>

            <div
              className="rounded-xl p-4"
              style={{ backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.02))' }}
            >
              <span
                className="text-xs uppercase tracking-wider font-mono"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Open Positions
              </span>
              <p className="text-xl font-bold font-mono mt-1">{positions.length}</p>
            </div>
          </div>

          {/* P&L chart */}
          <div className="mb-8">
            <PLChart />
          </div>

          {/* Positions table */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              border: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
            }}
          >
            <div
              className="grid grid-cols-6 gap-4 px-4 py-2 text-xs uppercase tracking-wider font-mono"
              style={{
                color: 'var(--text-tertiary)',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <span>Symbol</span>
              <span>Direction</span>
              <span>Size</span>
              <span>Entry</span>
              <span>Current</span>
              <span>P&amp;L</span>
            </div>
            {positions.map((pos) => (
              <PositionRow key={`${pos.venue}-${pos.symbol}`} position={pos} />
            ))}
            {positions.length === 0 && (
              <p
                className="text-center py-8 font-mono text-sm"
                style={{ color: 'var(--text-tertiary)' }}
              >
                No open positions
              </p>
            )}
          </div>

          {/* Full panel below */}
          <div className="mt-8">
            <PortfolioPanel isOpen={true} onClose={() => {}} />
          </div>
        </>
      )}
    </div>
  );
}
