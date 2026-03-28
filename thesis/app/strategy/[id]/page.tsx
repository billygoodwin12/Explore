'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import type { ThesisAnalysis, Recommendation } from '@/lib/venues/types';

// ---------------------------------------------------------------------------
// Mock strategy data
// ---------------------------------------------------------------------------

const MOCK_STRATEGY: ThesisAnalysis = {
  thesis_summary:
    'Rising geopolitical tensions in the Middle East will drive oil prices higher, strengthen the dollar as a safe-haven, and push crypto markets into risk-off mode. Prediction markets are underpricing the probability of sustained conflict.',
  causal_chain: [
    'Escalation of regional conflict disrupts oil supply routes',
    'Oil price spike triggers inflation expectations',
    'Fed delays rate cuts, strengthening USD',
    'Risk assets (crypto, equities) sell off on higher-for-longer narrative',
    'Prediction markets lag in repricing tail-risk scenarios',
  ],
  recommendations: [
    {
      venue: 'hyperliquid',
      instrument_type: 'perp',
      symbol: 'CL',
      name: 'Crude Oil Perpetual',
      direction: 'LONG',
      conviction: 0.85,
      rationale: 'Direct beneficiary of supply disruption from Middle East tensions.',
      category: 'commodity',
      correlation_to_thesis: 'direct',
    },
    {
      venue: 'hyperliquid',
      instrument_type: 'perp',
      symbol: 'ETH',
      name: 'Ethereum Perpetual',
      direction: 'SHORT',
      conviction: 0.7,
      rationale: 'Risk-off environment pressures crypto, ETH more sensitive than BTC.',
      category: 'crypto',
      correlation_to_thesis: 'second_order',
    },
    {
      venue: 'polymarket',
      instrument_type: 'prediction',
      symbol: 'fed-rate-cut-2026',
      name: 'Will the Fed cut rates before July 2026?',
      direction: 'BUY_NO',
      conviction: 0.75,
      rationale: 'Oil-driven inflation keeps the Fed on hold longer than markets expect.',
      category: 'prediction',
      correlation_to_thesis: 'second_order',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function directionColor(direction: string): string {
  if (direction === 'LONG' || direction === 'BUY_YES') return 'var(--accent-green, #34d399)';
  return 'var(--accent-red, #f87171)';
}

function convictionBar(conviction: number) {
  const pct = Math.round(conviction * 100);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 rounded-full"
        style={{
          width: 80,
          backgroundColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #9382ff, #34d399)',
          }}
        />
      </div>
      <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
        {pct}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StrategyPage() {
  const params = useParams<{ id: string }>();
  const strategyId = params.id;

  const strategy = MOCK_STRATEGY;

  function handleCopyStrategy() {
    // Stub: would clone strategy into user's portfolio
    alert(`Strategy "${strategyId}" copied to your portfolio.`);
  }

  return (
    <div
      className="min-h-screen p-6 md:p-10"
      style={{ backgroundColor: 'var(--bg-primary, #0a0a0f)' }}
    >
      {/* Header */}
      <div className="max-w-3xl mx-auto">
        <p
          className="text-xs uppercase tracking-wider font-mono mb-2"
          style={{ color: 'var(--text-tertiary, rgba(255,255,255,0.30))' }}
        >
          Shared Strategy &middot; {strategyId}
        </p>
        <h1
          className="text-2xl font-bold mb-6"
          style={{ color: 'var(--text-primary, rgba(255,255,255,0.92))' }}
        >
          Strategy View
        </h1>

        {/* Thesis Summary */}
        <section
          className="rounded-xl p-5 mb-6"
          style={{
            backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.02))',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
          }}
        >
          <h2
            className="text-xs uppercase tracking-wider font-mono mb-3"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Thesis Summary
          </h2>
          <p
            className="leading-relaxed text-sm"
            style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}
          >
            {strategy.thesis_summary}
          </p>
        </section>

        {/* Causal Chain */}
        <section
          className="rounded-xl p-5 mb-6"
          style={{
            backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.02))',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
          }}
        >
          <h2
            className="text-xs uppercase tracking-wider font-mono mb-3"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Causal Chain
          </h2>
          <ol className="space-y-2">
            {strategy.causal_chain.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span
                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono mt-0.5"
                  style={{
                    backgroundColor: 'rgba(147,130,255,0.15)',
                    color: '#9382ff',
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}>
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Recommendations */}
        <section
          className="rounded-xl p-5 mb-6"
          style={{
            backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.02))',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
          }}
        >
          <h2
            className="text-xs uppercase tracking-wider font-mono mb-3"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Recommendations ({strategy.recommendations.length})
          </h2>
          <div className="space-y-3">
            {strategy.recommendations.map((rec: Recommendation) => (
              <div
                key={`${rec.venue}-${rec.symbol}`}
                className="rounded-lg p-4"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-bold font-mono"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {rec.symbol}
                    </span>
                    <span
                      className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: 'rgba(147,130,255,0.12)',
                        color: '#9382ff',
                      }}
                    >
                      {rec.venue}
                    </span>
                  </div>
                  <span
                    className="text-xs font-bold font-mono"
                    style={{ color: directionColor(rec.direction) }}
                  >
                    {rec.direction}
                  </span>
                </div>
                <p
                  className="text-xs mb-2"
                  style={{ color: 'var(--text-tertiary, rgba(255,255,255,0.30))' }}
                >
                  {rec.name}
                </p>
                <p
                  className="text-sm mb-2 leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {rec.rationale}
                </p>
                <div className="flex items-center justify-between">
                  {convictionBar(rec.conviction)}
                  <span
                    className="text-[10px] uppercase font-mono"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {rec.correlation_to_thesis}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Copy Strategy button */}
        <button
          onClick={handleCopyStrategy}
          className="w-full rounded-xl py-3 text-sm font-bold cursor-pointer transition-opacity hover:opacity-90"
          style={{
            background: 'linear-gradient(135deg, #9382ff, #34d399)',
            color: '#000',
          }}
        >
          Copy Strategy
        </button>
      </div>
    </div>
  );
}
